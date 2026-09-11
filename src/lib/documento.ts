/**
 * CPF e CNPJ.
 *
 * O documento é criptografado no banco e NUNCA volta em claro pela API — o
 * front recebe só `documento_hash` (que não sabe calcular) e `documento_tipo`.
 * Por isso aqui não existe função de formatar nem de exibir: não há valor para
 * mostrar. O que sobra é preparar o que a pessoa digita na busca.
 */

export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

export type TipoDocumento = "cpf" | "cnpj" | null;

export function tipoDocumento(valor: string | null | undefined): TipoDocumento {
  const d = soDigitos(valor);
  if (d.length === 11) return "cpf";
  if (d.length === 14) return "cnpj";
  return null;
}

/**
 * O termo digitado serve para buscar por documento?
 *
 * Hash só casa valor inteiro: depois de criptografar, busca parcial por CPF
 * deixa de existir. Só vale a pena chamar o servidor com 11 ou 14 dígitos.
 */
export function pareceDocumentoCompleto(termo: string): boolean {
  const d = soDigitos(termo);
  return d.length === 11 || d.length === 14;
}

/**
 * A pessoa está claramente tentando digitar um documento, mas ainda não
 * terminou? Serve para a tela explicar por que a busca não achou nada, em vez
 * de só mostrar lista vazia.
 */
export function documentoIncompleto(termo: string): boolean {
  const d = soDigitos(termo);
  if (d.length === 0) return false;
  // Só considera "tentativa de documento" o que é quase todo dígito: "1003"
  // de uma fatura não deve disparar o aviso.
  const proporcaoDigitos = d.length / termo.replace(/[\s.\-/]/g, "").length;
  return proporcaoDigitos === 1 && d.length >= 6 && !pareceDocumentoCompleto(termo);
}

export function rotularTipo(tipo: TipoDocumento): string {
  if (tipo === "cpf") return "CPF";
  if (tipo === "cnpj") return "CNPJ";
  return "Sem documento";
}
