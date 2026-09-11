// Envia o código de acesso para quem está cadastrado na equipe.
//
// A regra que dá sentido a esta função: **só recebe código quem tem perfil
// ATIVO em `public.perfis`**. Quem não foi cadastrado pelo admin não recebe
// nada, e não fica sabendo por quê.
//
// Por que o código sai pelo Resend e não pelo Supabase: sem SMTP próprio, o
// mailer nativo manda 2 e-mails por hora e só entrega para membros da
// organização do projeto — a equipe de portaria não receberia nada. E há um
// efeito colateral que interessa: com o mailer nativo inerte, o endpoint
// público `POST /auth/v1/otp` (que qualquer um pode chamar, porque a chave
// anônima é pública) não consegue enviar. O único caminho que entrega é este,
// e ele confere `perfis` antes.
//
// `generateLink` GERA o código e não envia — quem envia somos nós.
//
// A resposta é sempre a mesma, aconteça o que acontecer: qualquer diferença
// viraria um jeito de descobrir quem tem acesso ao sistema.
//
// NUNCA logar e-mail nem código.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { cors, erro, json } from "../_shared/cors.ts";
import { APP_NOME, enviarEmail, layoutEmail } from "../_shared/email.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Precisa bater com `[auth.email] otp_expiry` no config.toml. */
const MINUTOS_VALIDADE = 10;

const RESPOSTA_PADRAO = { ok: true };

function corpoDoEmail(codigo: string, nome: string): string {
  return layoutEmail({
    preTitulo: "Seu código de acesso",
    titulo: `Olá, ${nome}`,
    corpo: `
      <p style="margin:0 0 20px;color:#52525b;font-size:15px;line-height:1.6;">
        Use o código abaixo para entrar no credenciamento. Ele vale por
        <strong>${MINUTOS_VALIDADE} minutos</strong>.
      </p>
      <div style="background:#f4f4f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
        <span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:0.25em;color:#081629;">${codigo}</span>
      </div>
      <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.6;">
        Se não foi você que pediu, pode ignorar este e-mail — sem o código,
        ninguém entra.
      </p>`,
  });
}

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
    // A lista de quem pode entrar é esta tabela. Um SELECT direto pelo e-mail
    // — antes isto varria `listUsers()`, que pagina de 50 em 50.
    const { data: perfil, error: erroPerfil } = await admin
      .from("perfis")
      .select("user_id, nome, ativo")
      .eq("email", email)
      .maybeSingle();

    if (erroPerfil) {
      console.error("falha ao consultar perfil:", erroPerfil.message);
      return json(RESPOSTA_PADRAO);
    }

    // Não cadastrado ou desativado: nada é enviado, e a resposta não muda.
    if (!perfil || perfil.ativo !== true) return json(RESPOSTA_PADRAO);

    const { data: link, error: erroLink } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    const codigo = link?.properties?.email_otp;
    if (erroLink || !codigo) {
      console.error("falha ao gerar código:", erroLink?.message);
      return json(RESPOSTA_PADRAO);
    }

    const enviado = await enviarEmail({
      para: email,
      assunto: `Seu código de acesso — ${APP_NOME}`,
      html: corpoDoEmail(codigo, perfil.nome),
    });

    // Mesmo com falha de envio a resposta é igual: o motivo mais provável é
    // problema do provedor, e o cliente não ganha nada sabendo disso.
    if (!enviado) console.error("e-mail de código não saiu");

    return json(RESPOSTA_PADRAO);
  } catch (e) {
    console.error("erro inesperado no envio:", e instanceof Error ? e.message : e);
    return json(RESPOSTA_PADRAO);
  }
});
