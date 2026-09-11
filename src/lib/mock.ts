import { nomeExibicao, normalizarNomeDigitado } from "@/lib/nomes";
import { soDigitos } from "@/lib/documento";
import {
  assinatura,
  diffImportacao,
  faturaNorm,
  type ParticipanteExistente,
} from "@/lib/importacao";
import type { LinhaCsv } from "@/lib/csv";
import type { Convite, Papel, Participante, Perfil, ResumoImportacao } from "@/lib/types";

/**
 * Banco de mentira, em memória.
 *
 * Imita o que as RPCs fazem — inclusive as regras que importam: credenciar é
 * idempotente, o nome real é acrescentado sem apagar o original, e a
 * importação reusa `diffImportacao`, o mesmo espelho do algoritmo SQL que os
 * testes exercitam. Assim o layout é avaliado com o comportamento real, não
 * com uma lista estática.
 *
 * Some do bundle quando `VITE_MOCK` não está ligado.
 */

/** O documento em claro só existe aqui, para a busca de mentira funcionar. */
interface ParticipanteMock extends Participante {
  documento_claro: string;
}

let sequencia = 0;
const novoId = () => `mock-${++sequencia}`;

interface Semente {
  nome: string;
  documento: string;
  comprador: string;
  fatura: string;
  lote: string;
  quantidade?: number;
  credenciados?: number;
  nomesReais?: string[];
  sumido?: boolean;
}

const SEMENTES: Semente[] = [
  // A coletiva do enunciado: 5 ingressos, todos com o nome de quem comprou.
  // Dois já foram identificados e credenciados na portaria.
  {
    nome: "Renata Karolina Rocha",
    documento: "345.678.901-23",
    comprador: "Renata Karolina Rocha",
    fatura: "INV-1003",
    lote: "2º lote",
    quantidade: 5,
    credenciados: 2,
    nomesReais: ["Ana Gabriela Prado", "Bruno Costa Lima"],
  },
  // Coletiva corporativa em CNPJ, nenhuma identificada ainda.
  {
    nome: "Construtora Vale LTDA",
    documento: "12.345.678/0001-99",
    comprador: "Construtora Vale LTDA",
    fatura: "INV-1007",
    lote: "Corporativo",
    quantidade: 4,
  },
  // Coletiva pequena, já resolvida por inteiro.
  {
    nome: "Marcos Aurélio Pinto",
    documento: "901.234.567-89",
    comprador: "Marcos Aurélio Pinto",
    fatura: "INV-1010",
    lote: "3º lote",
    quantidade: 2,
    credenciados: 2,
    nomesReais: ["Marcos Aurélio Pinto", "Helena Pinto Dias"],
  },
  // Fatura com duas pessoas já nomeadas na planilha: não é coletiva anônima.
  {
    nome: "José Antônio Sá",
    documento: "456.789.012-34",
    comprador: "Luciana Sá",
    fatura: "INV-1004",
    lote: "2º lote",
    credenciados: 1,
  },
  {
    nome: "Luciana Sá",
    documento: "567.890.123-45",
    comprador: "Luciana Sá",
    fatura: "INV-1004",
    lote: "2º lote",
  },
  // Individuais.
  { nome: "Marina Alves Ferreira", documento: "123.456.789-01", comprador: "Marina Alves Ferreira", fatura: "INV-1001", lote: "1º lote", credenciados: 1 },
  { nome: "Carlos Eduardo Nunes", documento: "234.567.890-12", comprador: "Carlos Eduardo Nunes", fatura: "INV-1002", lote: "1º lote", credenciados: 1 },
  { nome: "Paulo Henrique Lima", documento: "678.901.234-56", comprador: "Paulo Henrique Lima", fatura: "INV-1005", lote: "3º lote" },
  { nome: "Ana Beatriz Souza", documento: "789.012.345-67", comprador: "Ana Beatriz Souza", fatura: "INV-1006", lote: "3º lote" },
  { nome: "Conceição Ramos", documento: "159.357.486-20", comprador: "Conceição Ramos", fatura: "INV-1008", lote: "1º lote", credenciados: 1 },
  { nome: "Rafael Big Ben Oliveira", documento: "753.951.852-46", comprador: "Rafael Big Ben Oliveira", fatura: "INV-1009", lote: "2º lote" },
  { nome: "Juliana Prado Martins", documento: "852.741.963-08", comprador: "Juliana Prado Martins", fatura: "INV-1011", lote: "3º lote" },
  { nome: "Fernando Barros", documento: "357.159.753-11", comprador: "Fernando Barros", fatura: "INV-1012", lote: "1º lote" },
  { nome: "Beatriz Nogueira Salles", documento: "951.753.159-22", comprador: "Beatriz Nogueira Salles", fatura: "INV-1013", lote: "2º lote" },
  { nome: "Gustavo Henrique Fé", documento: "456.123.789-33", comprador: "Gustavo Henrique Fé", fatura: "INV-1014", lote: "Corporativo" },
  // Sem fatura: agrupado pelo documento.
  { nome: "Thiago Mendes", documento: "890.123.456-78", comprador: "Thiago Mendes", fatura: "", lote: "3º lote" },
  // Saiu da planilha na última importação, sem ter entrado.
  { nome: "Cancelado da Silva", documento: "111.222.333-44", comprador: "Cancelado da Silva", fatura: "INV-1015", lote: "1º lote", sumido: true },
];

function montar(): ParticipanteMock[] {
  const agora = Date.now();
  const lista: ParticipanteMock[] = [];

  for (const s of SEMENTES) {
    const quantidade = s.quantidade ?? 1;
    const coletiva =
      quantidade > 1 &&
      s.comprador.trim() !== "" &&
      s.nome.toLowerCase() === s.comprador.toLowerCase();

    for (let i = 0; i < quantidade; i++) {
      const nomeReal = s.nomesReais?.[i] ?? null;
      const credenciado = i < (s.credenciados ?? 0);

      lista.push({
        id: novoId(),
        nome_origem: s.nome,
        nome_real: nomeReal,
        nome_exibicao: nomeExibicao(nomeReal, s.nome),
        documento_claro: soDigitos(s.documento),
        documento_hash: `hash-${soDigitos(s.documento)}`,
        documento_tipo: soDigitos(s.documento).length === 14 ? "cnpj" : "cpf",
        email: `${s.nome.split(" ")[0].toLowerCase()}@exemplo.com`,
        comprador_nome: s.comprador,
        fatura: s.fatura === "" ? null : s.fatura,
        fatura_norm: faturaNorm(s.fatura, s.documento),
        lote: s.lote,
        precisa_identificacao: coletiva,
        sumido_em: s.sumido ? new Date(agora - 86_400_000).toISOString() : null,
        // Horários espalhados, para a lista não parecer sintética demais.
        checkin_em: credenciado
          ? new Date(agora - (30 + i * 7) * 60_000).toISOString()
          : null,
        checkin_por: credenciado ? "mock-operador" : null,
        nome_real_em: nomeReal ? new Date(agora - 25 * 60_000).toISOString() : null,
        nome_real_por: nomeReal ? "mock-operador" : null,
      });
    }
  }

  return lista;
}

let participantes: ParticipanteMock[] | null = null;

function dados(): ParticipanteMock[] {
  if (participantes === null) participantes = montar();
  return participantes;
}

let convitesIniciais: Convite[] | null = null;

function convitesAgora(): Convite[] {
  if (convitesIniciais === null) convitesIniciais = [
  {
    id: "conv-1",
    rotulo: "Renata (admin)",
    papel: "admin",
    expira_em: new Date(Date.now() + 40 * 3600_000).toISOString(),
    revogado_em: null,
    max_usos: 1,
    usos: 1,
    auth_user_id: "mock-admin",
    resgatado_em: new Date(Date.now() - 3 * 3600_000).toISOString(),
    primeiro_user_agent: "Mozilla/5.0 (iPhone)",
    criado_em: new Date(Date.now() - 4 * 3600_000).toISOString(),
  },
  {
    id: "conv-2",
    rotulo: "Bia — portaria",
    papel: "operador",
    expira_em: new Date(Date.now() + 44 * 3600_000).toISOString(),
    revogado_em: null,
    max_usos: 1,
    usos: 0,
    auth_user_id: null,
    resgatado_em: null,
    primeiro_user_agent: null,
    criado_em: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "conv-3",
    rotulo: "Estagiário (teste)",
    papel: "operador",
    expira_em: new Date(Date.now() + 20 * 3600_000).toISOString(),
    revogado_em: new Date(Date.now() - 30 * 60_000).toISOString(),
    max_usos: 1,
    usos: 1,
    auth_user_id: "mock-ex",
    resgatado_em: new Date(Date.now() - 90 * 60_000).toISOString(),
    primeiro_user_agent: "Mozilla/5.0 (Android)",
    criado_em: new Date(Date.now() - 5 * 3600_000).toISOString(),
    },
  ];
  return convitesIniciais;
}

const PERFIL: Perfil = {
  user_id: "mock-admin",
  nome: "Renata (demonstração)",
  papel: "admin",
  ativo: true,
};

/** Latência de mentira, para dar tempo de ver os estados de carregamento. */
const espera = (ms = 180) => new Promise((r) => setTimeout(r, ms));

function semSegredo(p: ParticipanteMock): Participante {
  const { documento_claro: _, ...publico } = p;
  return publico;
}

function acharOuFalhar(id: string): ParticipanteMock {
  const p = dados().find((x) => x.id === id);
  if (p === undefined) throw new Error("PARTICIPANTE_INEXISTENTE");
  return p;
}

function recalcularExibicao(p: ParticipanteMock) {
  p.nome_exibicao = nomeExibicao(p.nome_real, p.nome_origem);
}

export const mock = {
  perfil: PERFIL,

  async listarParticipantes(): Promise<Participante[]> {
    await espera();
    return dados().map(semSegredo);
  },

  /** No banco isto é um HMAC; aqui basta comparar os dígitos. */
  async buscarPorDocumento(texto: string): Promise<string[]> {
    await espera(80);
    const alvo = soDigitos(texto);
    if (alvo.length !== 11 && alvo.length !== 14) return [];
    return dados()
      .filter((p) => p.documento_claro === alvo)
      .map((p) => p.id);
  },

  async credenciar(id: string, nomeReal?: string | null): Promise<Participante> {
    await espera(120);
    const p = acharOuFalhar(id);
    const nome = normalizarNomeDigitado(nomeReal ?? null);

    if (nome !== null) {
      p.nome_real = nome;
      p.nome_real_em = new Date().toISOString();
      p.nome_real_por = PERFIL.user_id;
      recalcularExibicao(p);
    }
    // Idempotente, como a RPC: repetir não move a hora de entrada.
    if (p.checkin_em === null) {
      p.checkin_em = new Date().toISOString();
      p.checkin_por = PERFIL.user_id;
    }
    return semSegredo(p);
  },

  async desfazer(id: string): Promise<Participante> {
    await espera(120);
    const p = acharOuFalhar(id);
    // O nome real sobrevive: quem descobriu quem é a pessoa descobriu mesmo.
    p.checkin_em = null;
    p.checkin_por = null;
    return semSegredo(p);
  },

  async identificar(id: string, nomeReal: string | null): Promise<Participante> {
    await espera(120);
    const p = acharOuFalhar(id);
    p.nome_real = normalizarNomeDigitado(nomeReal);
    p.nome_real_em = p.nome_real ? new Date().toISOString() : null;
    p.nome_real_por = p.nome_real ? PERFIL.user_id : null;
    recalcularExibicao(p);
    return semSegredo(p);
  },

  async listarConvites(): Promise<Convite[]> {
    await espera();
    return [...convitesAgora()];
  },

  async criarConvite(rotulo: string, papel: Papel, horas: number) {
    await espera();
    const atuais = convitesAgora();
    const id = `conv-${atuais.length + 1}`;
    convitesIniciais = [
      {
        id,
        rotulo,
        papel,
        expira_em: new Date(Date.now() + horas * 3600_000).toISOString(),
        revogado_em: null,
        max_usos: 1,
        usos: 0,
        auth_user_id: null,
        resgatado_em: null,
        primeiro_user_agent: null,
        criado_em: new Date().toISOString(),
      },
      ...atuais,
    ];
    return { id, token: `mock-${Math.random().toString(36).slice(2, 18)}` };
  },

  async revogarConvite(id: string) {
    await espera();
    convitesIniciais = convitesAgora().map((c) =>
      c.id === id ? { ...c, revogado_em: new Date().toISOString() } : c,
    );
  },

  /**
   * Importação de mentira sobre o algoritmo de verdade: reusa
   * `diffImportacao`, o mesmo espelho do SQL coberto pelos testes.
   */
  async importar(linhas: LinhaCsv[], confirmar: boolean): Promise<ResumoImportacao> {
    await espera(400);

    const existentes: ParticipanteExistente[] = dados().map((p) => ({
      id: p.id,
      fatura_norm: p.fatura_norm,
      assinatura: assinatura(p.nome_origem, p.documento_claro),
      ocorrencia: 1,
      nome_origem: p.nome_origem,
      nome_real: p.nome_real,
      checkin_em: p.checkin_em,
      sumido_em: p.sumido_em,
      email: p.email,
      lote: p.lote,
      comprador_nome: p.comprador_nome,
      fatura: p.fatura,
      documento_hash: p.documento_claro,
      precisa_identificacao: p.precisa_identificacao,
    }));

    // A ocorrência real vem do banco; aqui renumeramos por grupo para o diff
    // enxergar os ingressos repetidos da mesma coletiva.
    const contagem = new Map<string, number>();
    for (const e of existentes) {
      const k = `${e.fatura_norm}|${e.assinatura}`;
      const n = (contagem.get(k) ?? 0) + 1;
      contagem.set(k, n);
      e.ocorrencia = n;
    }

    const diff = diffImportacao(linhas, existentes);

    if (confirmar) {
      for (const { existente } of diff.atualizados) {
        const p = dados().find((x) => x.id === existente.id);
        if (p) p.sumido_em = null;
      }
      for (const s of diff.sumidos) {
        const p = dados().find((x) => x.id === s.id);
        if (p) p.sumido_em = new Date().toISOString();
      }
      for (const linha of diff.novos) {
        const digitos = soDigitos(linha.documento);
        dados().push({
          id: novoId(),
          nome_origem: linha.nome,
          nome_real: null,
          nome_exibicao: linha.nome,
          documento_claro: digitos,
          documento_hash: `hash-${digitos}`,
          documento_tipo: digitos.length === 14 ? "cnpj" : digitos.length === 11 ? "cpf" : null,
          email: linha.email || null,
          comprador_nome: linha.comprador || null,
          fatura: linha.fatura || null,
          fatura_norm: linha.faturaNorm,
          lote: linha.lote || null,
          precisa_identificacao: linha.precisaIdentificacao,
          sumido_em: null,
          checkin_em: null,
          checkin_por: null,
          nome_real_em: null,
          nome_real_por: null,
        });
      }
    }

    const amostra = <T>(xs: T[]) => xs.slice(0, 50);

    return {
      confirmado: confirmar,
      linhas_total: linhas.length,
      ignoradas: 0,
      novos: diff.novos.length,
      atualizados: diff.atualizados.length,
      inalterados: diff.inalterados.length,
      sumidos: diff.sumidos.length,
      coletivas: diff.novos.filter((l) => l.precisaIdentificacao).length,
      sumidos_credenciados: diff.sumidosCredenciados.map((p) => ({
        nome: nomeExibicao(p.nome_real, p.nome_origem),
        fatura: p.fatura ?? p.fatura_norm,
        checkin_em: p.checkin_em ?? "",
      })),
      amostra_novos: amostra(diff.novos).map((l) => ({
        nome: l.nome,
        fatura: l.fatura || null,
        lote: l.lote || null,
        coletiva: l.precisaIdentificacao,
      })),
      amostra_sumidos: amostra(diff.sumidos).map((p) => ({
        nome: nomeExibicao(p.nome_real, p.nome_origem),
        fatura: p.fatura ?? p.fatura_norm,
        credenciado: p.checkin_em !== null,
      })),
    };
  },

  /** Volta tudo ao estado inicial, sem recarregar a página. */
  reiniciar() {
    sequencia = 0;
    participantes = null;
    convitesIniciais = null;
  },
};
