// Revoga um convite e derruba a sessão de quem o resgatou.
//
// O corte que de fato vale é `perfis.ativo = false`, feito pela RPC: a RLS
// consulta isso a cada query, então o acesso morre na consulta seguinte mesmo
// com um JWT ainda válido. O signOut aqui é complemento — invalida o refresh
// token para a sessão não se renovar indefinidamente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { cors, erro, json } from "../_shared/cors.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return erro("METODO_INVALIDO", 405);

  const autorizacao = req.headers.get("Authorization");
  if (!autorizacao) return erro("SEM_PERMISSAO", 401);

  let conviteId: string;
  try {
    const corpo = await req.json();
    conviteId = String(corpo?.convite_id ?? "").trim();
  } catch {
    return erro("CORPO_INVALIDO");
  }
  if (conviteId === "") return erro("CORPO_INVALIDO");

  // Client com o JWT de quem chamou: é assim que `revogar_convite` enxerga
  // auth.uid() e consegue checar is_admin(). Não dá para fazer isso com a
  // service role, que não tem usuário nenhum associado.
  const comoUsuario = createClient(URL_SUPABASE, ANON, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: erroRevogar } = await comoUsuario.rpc("revogar_convite", {
    p_convite_id: conviteId,
  });
  if (erroRevogar) {
    if (erroRevogar.message.includes("SEM_PERMISSAO")) return erro("SEM_PERMISSAO", 403);
    console.error("falha ao revogar:", erroRevogar.message);
    return erro("FALHA_INTERNA", 500);
  }

  const admin = createClient(URL_SUPABASE, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: convite } = await admin
    .from("convites")
    .select("auth_user_id")
    .eq("id", conviteId)
    .maybeSingle();

  if (convite?.auth_user_id) {
    const { error: erroSignOut } = await admin.auth.admin.signOut(
      convite.auth_user_id,
      "global",
    );
    // O acesso já caiu pela RLS; falhar aqui não desfaz a revogação.
    if (erroSignOut) console.error("signOut falhou:", erroSignOut.message);
  }

  return json({ ok: true });
});
