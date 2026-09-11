// Envia um código de acesso para quem já é admin.
//
// Existe para uma única situação: o admin fez logout e o convite dele já foi
// consumido. Sem isto, a saída seria voltar ao SQL Editor e inserir outro
// convite à mão.
//
// Só dispara para e-mail que corresponde a um perfil admin ATIVO. A checagem
// acontece aqui, com service role, porque o cliente não tem como saber quem é
// admin — e não deveria ter.
//
// A resposta é sempre a mesma, exista o e-mail ou não: uma resposta que
// diferenciasse os casos viraria um jeito de descobrir quem tem acesso.
//
// NUNCA logar o e-mail nem o código.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { cors, erro, json } from "../_shared/cors.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Resposta única, para não revelar quem tem acesso. */
const RESPOSTA_PADRAO = { ok: true };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return erro("METODO_INVALIDO", 405);

  let email: string;
  try {
    const corpo = await req.json();
    email = String(corpo?.email ?? "").trim().toLowerCase();
  } catch {
    return erro("CORPO_INVALIDO");
  }
  if (email === "" || !email.includes("@")) return erro("EMAIL_INVALIDO");

  const admin = createClient(URL_SUPABASE, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // auth.users é quem guarda o e-mail; perfis é quem guarda o papel.
    const { data: lista, error: erroLista } = await admin.auth.admin.listUsers();
    if (erroLista) {
      console.error("falha ao listar usuários:", erroLista.message);
      return json(RESPOSTA_PADRAO);
    }

    const usuario = lista?.users?.find((u) => u.email?.toLowerCase() === email);
    if (!usuario) return json(RESPOSTA_PADRAO);

    const { data: perfil } = await admin
      .from("perfis")
      .select("papel, ativo")
      .eq("user_id", usuario.id)
      .maybeSingle();

    // Operador não usa esta porta: ele pede um link novo a quem administra.
    // Revogado também não — `ativo` é o que corta o acesso em todo o sistema.
    if (perfil?.papel !== "admin" || perfil?.ativo !== true) {
      return json(RESPOSTA_PADRAO);
    }

    // Quem envia é o próprio Auth. `shouldCreateUser: false` garante que esta
    // rota nunca crie conta — ela só reabre o acesso de quem já tem.
    const anonimo = createClient(URL_SUPABASE, ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: erroEnvio } = await anonimo.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (erroEnvio) {
      console.error("falha ao enviar código:", erroEnvio.message);
      // Ainda assim a resposta é a mesma: o cliente não precisa saber, e o
      // motivo mais provável é limite de envio, não e-mail inexistente.
      return json(RESPOSTA_PADRAO);
    }

    return json(RESPOSTA_PADRAO);
  } catch (e) {
    console.error("erro inesperado no envio:", e instanceof Error ? e.message : e);
    return json(RESPOSTA_PADRAO);
  }
});
