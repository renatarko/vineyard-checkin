export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Erro para o cliente.
 *
 * `codigo` é uma etiqueta estável que a tela traduz; a mensagem detalhada
 * fica no servidor. Em particular, todo problema de convite (inexistente,
 * expirado, revogado, esgotado) sai como o MESMO código: se a resposta
 * distinguisse os casos, viraria um oráculo para descobrir tokens válidos.
 */
export function erro(codigo: string, status = 400): Response {
  return json({ erro: codigo }, status);
}
