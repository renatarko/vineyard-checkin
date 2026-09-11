import { normalizarTexto } from "@/lib/nomes";
import type { Participante } from "@/lib/types";

/**
 * Busca da portaria.
 *
 * Roda inteira no navegador, sobre a lista já carregada. Para alguns milhares
 * de pessoas isso é instantâneo e, mais importante, continua funcionando
 * quando o wi-fi do salão oscila no meio da fila — o que uma busca que vai ao
 * servidor a cada tecla não faz.
 *
 * O documento é a única exceção: ele está criptografado e o front não tem a
 * chave, então busca por CPF passa pela RPC `buscar_por_documento` e chega
 * aqui já resolvida, como uma lista de ids (ver `filtrarParticipantes`).
 */

export interface ParticipanteBuscavel extends Participante {
  /** Pré-calculado uma vez por lista, não a cada tecla. */
  _busca?: string;
}

/** Tudo por onde se pode procurar alguém, num texto só. */
export function textoBuscavel(p: Participante): string {
  return [
    normalizarTexto(p.nome_origem),
    normalizarTexto(p.nome_real),
    normalizarTexto(p.comprador_nome),
    normalizarTexto(p.fatura),
    normalizarTexto(p.lote),
  ]
    .filter((s) => s !== "")
    .join(" ");
}

export function indexar(lista: Participante[]): ParticipanteBuscavel[] {
  return lista.map((p) => ({ ...p, _busca: textoBuscavel(p) }));
}

/**
 * Ordem da lista: quem ainda não entrou primeiro, e dentro disso as coletivas
 * pendentes de identificação antes das demais — são as que tomam mais tempo no
 * balcão. Credenciados afundam, porque já saíram do caminho.
 */
export function compararParaFila(a: Participante, b: Participante): number {
  const feito = Number(a.checkin_em !== null) - Number(b.checkin_em !== null);
  if (feito !== 0) return feito;

  if (a.checkin_em === null) {
    const pendente =
      Number(b.precisa_identificacao && b.nome_real === null) -
      Number(a.precisa_identificacao && a.nome_real === null);
    if (pendente !== 0) return pendente;
  }

  return a.nome_exibicao.localeCompare(b.nome_exibicao, "pt-BR");
}

/**
 * Filtra por nome (do CSV ou o real), comprador, fatura e lote.
 *
 * `idsPorDocumento` é o resultado da busca por CPF vindo do servidor, quando
 * houve uma: os ids entram na lista mesmo sem casar textualmente, porque o
 * documento não está em lugar nenhum no cliente para ser comparado.
 */
export function filtrarParticipantes(
  lista: ParticipanteBuscavel[],
  termo: string,
  idsPorDocumento?: ReadonlySet<string>,
): ParticipanteBuscavel[] {
  const alvo = normalizarTexto(termo);
  if (alvo === "" && idsPorDocumento === undefined) {
    return [...lista].sort(compararParaFila);
  }

  // Cada palavra precisa aparecer em algum lugar: "ana 1003" acha a Ana da
  // fatura INV-1003 sem exigir que se digite tudo na ordem certa.
  const palavras = alvo.split(" ").filter((p) => p !== "");

  return lista
    .filter((p) => {
      if (idsPorDocumento !== undefined && idsPorDocumento.has(p.id)) return true;
      if (palavras.length === 0) return false;
      const texto = p._busca ?? textoBuscavel(p);
      return palavras.every((palavra) => texto.includes(palavra));
    })
    .sort(compararParaFila);
}

/** Abas de situação da lista, como na barra acima da tabela. */
export type Situacao = "todos" | "realizados" | "pendentes";

/**
 * Lotes presentes na lista, para montar os chips de filtro.
 *
 * Sai dos próprios dados, e não de uma lista fixa: os lotes mudam de evento
 * para evento e são só um texto livre na planilha.
 */
export function lotesDisponiveis(lista: Participante[]): string[] {
  const vistos = new Map<string, string>();
  for (const p of lista) {
    const lote = p.lote?.trim();
    if (lote === undefined || lote === "") continue;
    // Mantém a grafia original, mas não repete "1º Lote" e "1º lote".
    if (!vistos.has(normalizarTexto(lote))) vistos.set(normalizarTexto(lote), lote);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function filtrarPorLote(
  lista: ParticipanteBuscavel[],
  lote: string | null,
): ParticipanteBuscavel[] {
  if (lote === null) return lista;
  const alvo = normalizarTexto(lote);
  return lista.filter((p) => normalizarTexto(p.lote) === alvo);
}

export function filtrarPorSituacao(
  lista: ParticipanteBuscavel[],
  situacao: Situacao,
): ParticipanteBuscavel[] {
  if (situacao === "todos") return lista;
  const credenciado = situacao === "realizados";
  return lista.filter((p) => (p.checkin_em !== null) === credenciado);
}

export interface Contadores {
  total: number;
  credenciados: number;
  pendentesIdentificacao: number;
}

export function contar(lista: Participante[]): Contadores {
  let credenciados = 0;
  let pendentesIdentificacao = 0;
  let total = 0;

  for (const p of lista) {
    // Quem sumiu da planilha sem nunca ter entrado não conta como esperado.
    if (p.sumido_em !== null && p.checkin_em === null) continue;
    total += 1;
    if (p.checkin_em !== null) credenciados += 1;
    else if (p.precisa_identificacao && p.nome_real === null) pendentesIdentificacao += 1;
  }

  return { total, credenciados, pendentesIdentificacao };
}
