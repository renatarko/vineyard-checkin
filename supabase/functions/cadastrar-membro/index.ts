// Cadastra alguém na equipe: cria o usuário no Auth e o perfil, e avisa a
// pessoa por e-mail.
//
// Só admin chama. A checagem usa o JWT de quem pediu — por isso `verify_jwt`
// fica ligado e a autorização é feita com um client que carrega esse token,
// não com service role (que não tem `auth.uid()` e passaria por qualquer
// `is_admin()`).
//
// NUNCA logar e-mail nem nome.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { cors, erro, json } from "../_shared/cors.ts";
import { APP_NOME, botao, enviarEmail, layoutEmail } from "../_shared/email.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const URL_APP = Deno.env.get("URL_APP") ?? "https://vineyard-checkin.vercel.app";

function avisoDeAcesso(nome: string, ehAdmin: boolean): string {
  return layoutEmail({
    preTitulo: "Acesso liberado",
    titulo: `Olá, ${nome}`,
    corpo: `
      <p style="margin:0 0 20px;color:#52525b;font-size:15px;line-height:1.6;">
        Você faz parte da equipe do credenciamento${
          ehAdmin ? ", com acesso de administrador" : ""
        }. Para entrar, abra o endereço abaixo e informe <strong>este mesmo
        e-mail</strong> — um código de acesso chega na hora.
      </p>
      ${botao("Abrir o credenciamento", `${URL_APP}/login`)}
      <p style="margin:24px 0 0;color:#a1a1aa;font-size:13px;line-height:1.6;">
        Não é preciso criar senha. Guarde este e-mail: é por ele que você entra.
      </p>`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return erro("METODO_INVALIDO", 405);

  const autorizacao = req.headers.get("Authorization");
  if (!autorizacao) return erro("SEM_PERMISSAO", 401);

  let nome: string;
  let email: string;
  let papel: string;
  try {
    const corpo = await req.json();
    nome = String(corpo?.nome ?? "").trim();
    email = String(corpo?.email ?? "").trim().toLowerCase();
    papel = String(corpo?.papel ?? "operador");
  } catch {
    return erro("CORPO_INVALIDO");
  }

  if (nome === "") return erro("NOME_OBRIGATORIO");
  if (email === "" || !email.includes("@")) return erro("EMAIL_INVALIDO");
  if (papel !== "admin" && papel !== "operador") return erro("PAPEL_INVALIDO");

  // Client com o JWT de quem chamou: é assim que `is_admin()` enxerga
  // `auth.uid()`. Service role não serve para autorizar.
  const comoUsuario = createClient(URL_SUPABASE, ANON, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: ehAdmin, error: erroChecagem } = await comoUsuario.rpc("is_admin");
  if (erroChecagem || ehAdmin !== true) return erro("SEM_PERMISSAO", 403);

  const admin = createClient(URL_SUPABASE, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let userId: string;

    const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      // Sem confirmar, `generateLink` tropeça — e não há caixa de entrada
      // para confirmar, porque o acesso aqui é concedido pelo admin.
      email_confirm: true,
      user_metadata: { nome, papel },
    });

    if (erroCriar) {
      // E-mail já no Auth: alguém recadastrado, ou que entrou por convite
      // antes. Reaproveitar é o certo — duas contas para o mesmo endereço
      // deixariam o login ambíguo.
      // `listUsers()` devolve 50 por página: numa base maior, a pessoa
      // procurada simplesmente não apareceria e a função concluiria que ela
      // não existe. A RPC faz o lookup direto.
      const { data: achado } = await admin.rpc("usuario_por_email", { p_email: email });
      if (!achado) {
        console.error("falha ao criar usuário:", erroCriar.message);
        return erro("FALHA_INTERNA", 500);
      }
      userId = achado as string;

      // Usuário criado à mão no painel vem sem e-mail confirmado, e
      // `generateLink` tropeça nisso.
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    } else if (criado?.user) {
      userId = criado.user.id;
    } else {
      return erro("FALHA_INTERNA", 500);
    }

    const { data: perfil, error: erroPerfil } = await admin
      .rpc("registrar_membro", {
        p_user_id: userId,
        p_nome: nome,
        p_email: email,
        p_papel: papel,
      })
      .maybeSingle();

    if (erroPerfil) {
      if (erroPerfil.message.includes("NOME_OBRIGATORIO")) return erro("NOME_OBRIGATORIO");
      console.error("falha ao registrar perfil:", erroPerfil.message);
      return erro("FALHA_INTERNA", 500);
    }

    // O aviso é cortesia: se o e-mail não sair, a pessoa continua cadastrada e
    // consegue entrar pelo /login. Por isso a falha não derruba o cadastro.
    const avisado = await enviarEmail({
      para: email,
      assunto: `Você tem acesso ao ${APP_NOME}`,
      html: avisoDeAcesso(nome, papel === "admin"),
    });

    return json({ perfil, avisado });
  } catch (e) {
    console.error("erro inesperado no cadastro:", e instanceof Error ? e.message : e);
    return erro("FALHA_INTERNA", 500);
  }
});
