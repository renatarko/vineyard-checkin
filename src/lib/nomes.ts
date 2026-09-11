/**
 * Normalização e composição de nomes.
 *
 * A regra central do produto mora aqui: numa inscrição coletiva, o nome que
 * veio do CSV é o do comprador, e na portaria se descobre quem realmente está
 * usando aquele ingresso. O nome real é ACRESCENTADO, nunca substitui — o
 * original é a única pista que resta para reencontrar o ingresso depois.
 */

/** Caixa baixa, sem acento, espaços colapsados. Para comparar, nunca para exibir. */
export function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Limpa o que foi digitado no celular, com pressa. `null` quando não sobra nada. */
export function normalizarNomeDigitado(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim().replace(/\s+/g, " ");
  return limpo === "" ? null : limpo;
}

export const LIMITE_NOME = 120;

/**
 * Mesma pessoa? Compara ignorando acento e caixa.
 *
 * Aqui "José" e "Jose" são a MESMA pessoa — é um ser humano só, parado no
 * balcão, e quem digitou sem acento não criou um participante novo.
 */
export function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  return na !== "" && na === nb;
}

/**
 * Como o nome aparece na lista. Espelha exatamente a coluna gerada
 * `participantes.nome_exibicao` — com uma diferença deliberada: o banco não
 * consegue ignorar acento numa coluna gerada, então lá "José"/"Jose" saem
 * concatenados e aqui não. Quem manda na tela é esta função.
 */
export function nomeExibicao(
  nomeReal: string | null | undefined,
  nomeOrigem: string,
): string {
  const real = normalizarNomeDigitado(nomeReal);
  if (real === null) return nomeOrigem;
  if (mesmoNome(real, nomeOrigem)) return nomeOrigem;
  return `${real} - ${nomeOrigem}`;
}

/** Valida o campo "nome real" antes de mandar para o banco. */
export function validarNomeReal(valor: string): { ok: true; nome: string } | { ok: false; erro: string } {
  const nome = normalizarNomeDigitado(valor);
  if (nome === null) return { ok: false, erro: "Digite o nome do participante." };
  if (nome.length < 2) return { ok: false, erro: "Nome curto demais." };
  if (nome.length > LIMITE_NOME) return { ok: false, erro: `Nome com mais de ${LIMITE_NOME} caracteres.` };
  return { ok: true, nome };
}
