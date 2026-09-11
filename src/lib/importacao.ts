import { normalizarTexto } from "@/lib/nomes";
import { soDigitos } from "@/lib/documento";
import type { LinhaCsv } from "@/lib/csv";

/**
 * Espelho em TypeScript do algoritmo de `importar_participantes`.
 *
 * O banco é quem manda de verdade — esta cópia existe para as regras poderem
 * ser testadas rápido, sem subir Postgres, e para a tela conseguir explicar o
 * preview. Se uma das duas mudar, a outra tem que mudar junto; os testes deste
 * arquivo são o contrato entre elas.
 *
 * Uma diferença deliberada: no banco a identidade usa o HMAC do documento,
 * porque o valor em claro não existe lá. Aqui os dígitos fazem esse papel, para
 * os testes rodarem sem chave. O que importa nas duas pontas é a função ser
 * determinística e depender só do documento — e isso vale para ambas.
 */

/** Linha já existente no banco, no mínimo que o casamento precisa saber. */
export interface ParticipanteExistente {
  id: string;
  fatura_norm: string;
  assinatura: string;
  ocorrencia: number;
  nome_origem: string;
  nome_real: string | null;
  checkin_em: string | null;
  sumido_em: string | null;
  email: string | null;
  lote: string | null;
  comprador_nome: string | null;
  fatura: string | null;
  documento_hash: string;
  precisa_identificacao: boolean;
}

export interface LinhaPreparada extends LinhaCsv {
  faturaNorm: string;
  assinatura: string;
  precisaIdentificacao: boolean;
  rankCsv: number;
}

export interface DiffImportacao {
  novos: LinhaPreparada[];
  atualizados: { existente: ParticipanteExistente; linha: LinhaPreparada }[];
  inalterados: { existente: ParticipanteExistente; linha: LinhaPreparada }[];
  sumidos: ParticipanteExistente[];
  /** Subconjunto de `sumidos` que já passou pela portaria. É o alerta vermelho. */
  sumidosCredenciados: ParticipanteExistente[];
}

/**
 * Chave composta sem separador mágico: cada parte vem prefixada pelo próprio
 * comprimento, então nenhum conteúdo consegue imitar a fronteira entre elas.
 */
function chave(...partes: (string | number)[]): string {
  return partes.map((p) => `${String(p).length}:${p}`).join("");
}

/**
 * Identidade da linha. Depende SÓ de nome e documento.
 *
 * Email, lote e comprador ficam de fora de propósito: eles mudam entre
 * exportações sem que a pessoa tenha mudado, e se entrassem na chave cada
 * correção de e-mail viraria "sumiu um, entrou outro".
 */
export function assinatura(nome: string, documento: string): string {
  return `${normalizarTexto(nome)}|${soDigitos(documento)}`;
}

/** Agrupa os ingressos de uma mesma compra. Sem fatura, cai no documento. */
export function faturaNorm(fatura: string, documento: string): string {
  const f = normalizarTexto(fatura);
  return f !== "" ? f : `semfatura:${soDigitos(documento)}`;
}

/**
 * Coletiva: a fatura tem mais de um ingresso E o nome do participante repete o
 * do comprador. Uma fatura com nomes distintos não é coletiva anônima — já
 * veio identificada.
 */
export function detectarColetiva(linhas: LinhaCsv[]): boolean[] {
  const porFatura = new Map<string, number>();
  const chaves = linhas.map((l) => faturaNorm(l.fatura, l.documento));
  chaves.forEach((k) => porFatura.set(k, (porFatura.get(k) ?? 0) + 1));

  return linhas.map((l, i) => {
    const varios = (porFatura.get(chaves[i]) ?? 0) > 1;
    const nomeDoComprador =
      l.comprador.trim() !== "" &&
      normalizarTexto(l.nome) === normalizarTexto(l.comprador);
    return varios && nomeDoComprador;
  });
}

export function prepararLinhas(linhas: LinhaCsv[]): LinhaPreparada[] {
  const coletivas = detectarColetiva(linhas);
  const contadores = new Map<string, number>();

  return linhas.map((l, i) => {
    const fn = faturaNorm(l.fatura, l.documento);
    const asn = assinatura(l.nome, l.documento);
    const k = chave(fn, asn);
    const rank = (contadores.get(k) ?? 0) + 1;
    contadores.set(k, rank);
    return {
      ...l,
      faturaNorm: fn,
      assinatura: asn,
      precisaIdentificacao: coletivas[i],
      rankCsv: rank,
    };
  });
}

/**
 * Ordem de sobrevivência dentro de um grupo (mesma fatura, mesma assinatura).
 *
 * É a regra mais importante do arquivo. Quando uma fatura tinha 3 ingressos
 * idênticos e o CSV novo traz 2, não dá para saber qual foi cancelado — e
 * tanto faz, EXCETO que um deles pode já ter entrado no evento. Ranqueando
 * credenciado > identificado > ativo, o "sumiu" cai sempre numa linha intocada.
 */
function ordenarPorImportancia(a: ParticipanteExistente, b: ParticipanteExistente): number {
  const peso = (p: ParticipanteExistente) =>
    (p.checkin_em !== null ? 4 : 0) +
    (p.nome_real !== null ? 2 : 0) +
    (p.sumido_em === null ? 1 : 0);
  const d = peso(b) - peso(a);
  return d !== 0 ? d : a.ocorrencia - b.ocorrencia;
}

/** Só o payload entra na comparação: identidade e trabalho da portaria, não. */
function mudou(existente: ParticipanteExistente, linha: LinhaPreparada): boolean {
  const ou = (v: string | null) => (v === null || v === "" ? null : v);
  return (
    ou(existente.email) !== ou(linha.email) ||
    ou(existente.lote) !== ou(linha.lote) ||
    ou(existente.comprador_nome) !== ou(linha.comprador) ||
    ou(existente.fatura) !== ou(linha.fatura) ||
    existente.precisa_identificacao !== linha.precisaIdentificacao ||
    existente.sumido_em !== null
  );
}

export function diffImportacao(
  linhasCsv: LinhaCsv[],
  existentes: ParticipanteExistente[],
): DiffImportacao {
  const preparadas = prepararLinhas(linhasCsv);

  // Ranqueia os existentes dentro de cada grupo, por importância.
  const grupos = new Map<string, ParticipanteExistente[]>();
  for (const p of existentes) {
    const k = chave(p.fatura_norm, p.assinatura);
    const lista = grupos.get(k);
    if (lista) lista.push(p);
    else grupos.set(k, [p]);
  }

  const porRank = new Map<string, ParticipanteExistente>();
  for (const [k, lista] of grupos) {
    [...lista].sort(ordenarPorImportancia).forEach((p, i) => {
      porRank.set(chave(k, i + 1), p);
    });
  }

  const diff: DiffImportacao = {
    novos: [],
    atualizados: [],
    inalterados: [],
    sumidos: [],
    sumidosCredenciados: [],
  };
  const casados = new Set<string>();

  for (const linha of preparadas) {
    const k = chave(chave(linha.faturaNorm, linha.assinatura), linha.rankCsv);
    const existente = porRank.get(k);
    if (existente === undefined) {
      diff.novos.push(linha);
      continue;
    }
    casados.add(existente.id);
    if (mudou(existente, linha)) diff.atualizados.push({ existente, linha });
    else diff.inalterados.push({ existente, linha });
  }

  for (const p of existentes) {
    if (casados.has(p.id) || p.sumido_em !== null) continue;
    diff.sumidos.push(p);
    if (p.checkin_em !== null) diff.sumidosCredenciados.push(p);
  }

  return diff;
}
