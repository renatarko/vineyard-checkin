// Troca o token de um convite por uma sessão do Supabase Auth.
//
// Não existe login por e-mail neste projeto: o link é a credencial. Esta
// função é o único lugar onde isso vira uma sessão de verdade, e por isso ela
// roda com service role e é a única chamada que dispensa JWT.
//
// O usuário do Auth usa o e-mail informado no convite, quando há um, e cai
// num endereço sintético quando não há. Em nenhum dos casos sai mensagem:
// generateLink GERA o token, não envia.
//
// NUNCA logar token, e-mail ou qualquer dado de participante aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1";
import { cors, erro, json } from "../_shared/cors.ts";

const URL_SUPABASE = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const DOMINIO = Deno.env.get("DOMINIO_CONVITES") ?? "vineyard-checkin.rerko.net";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return erro("METODO_INVALIDO", 405);

  let token: string;
  try {
    const corpo = await req.json();
    token = String(corpo?.token ?? "").trim();
  } catch {
    return erro("CORPO_INVALIDO");
  }
  if (token === "") return erro("CONVITE_INVALIDO", 404);

  // Dois clients com papéis separados: o admin nunca é usado para autenticar,
  // e o anônimo nunca vê a service role.
  const admin = createClient(URL_SUPABASE, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonimo = createClient(URL_SUPABASE, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userAgent = req.headers.get("user-agent") ?? null;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    null;

  // Valida e incrementa numa instrução só: dois resgates simultâneos não
  // conseguem furar o max_usos.
  const { data: consumido, error: erroConsumo } = await admin
    .rpc("consumir_convite", { p_token: token, p_user_agent: userAgent, p_ip: ip })
    .maybeSingle();

  if (erroConsumo) {
    console.error("falha ao consumir convite:", erroConsumo.message);
    return erro("FALHA_INTERNA", 500);
  }
  // Inexistente, expirado, revogado e esgotado saem todos iguais, de propósito.
  if (!consumido) return erro("CONVITE_INVALIDO", 404);

  const { convite_id, papel, rotulo, auth_user_id, email: emailConvite } = consumido as {
    convite_id: string;
    papel: string;
    rotulo: string;
    auth_user_id: string | null;
    email: string | null;
  };

  try {
    let userId = auth_user_id;

    // Com e-mail informado no convite, o usuário do Auth fica identificável no
    // painel. Sem ele, cai num endereço derivado do id do convite — que também
    // faz reabrir o mesmo convite reencontrar a mesma pessoa, em vez de criar
    // outra. Nenhum dos dois recebe mensagem: nada é enviado aqui.
    const email = emailConvite ?? `c-${convite_id}@${DOMINIO}`;

    if (!userId) {
      const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
        email,
        // Sem isto, generateLink tropeça em usuário não confirmado — e não há
        // caixa de entrada nenhuma para confirmar.
        email_confirm: true,
        user_metadata: { rotulo, papel },
      });

      if (erroCriar) {
        // E-mail real pode já existir no Auth: convite reemitido para a mesma
        // pessoa, ou alguém já cadastrado na equipe. Reaproveitar é o certo —
        // criar outro deixaria duas contas para o mesmo endereço.
        //
        // Lookup pela RPC, e não por `listUsers()`, que devolve 50 por página:
        // numa base maior a pessoa não apareceria e cairíamos em FALHA_INTERNA.
        const { data: achado } = await admin.rpc("usuario_por_email", { p_email: email });
        if (!achado) {
          console.error("falha ao criar usuário:", erroCriar.message);
          return erro("FALHA_INTERNA", 500);
        }
        userId = achado as string;

        // Usuário criado à mão no painel costuma vir sem e-mail confirmado, e
        // generateLink tropeça nisso. Confirmar aqui é legítimo: o acesso foi
        // provado pelo token do convite, não pela caixa de entrada.
        const { error: erroConfirmar } = await admin.auth.admin.updateUserById(
          userId,
          { email_confirm: true },
        );
        if (erroConfirmar) {
          console.error("falha ao confirmar e-mail:", erroConfirmar.message);
          return erro("FALHA_INTERNA", 500);
        }
      } else if (criado?.user) {
        userId = criado.user.id;
      } else {
        return erro("FALHA_INTERNA", 500);
      }
    }

    // Amarra o usuário ao convite e cria/reativa o perfil, que é o que a RLS
    // consulta. Antes de emitir a sessão: uma sessão sem perfil não vê nada.
    const { error: erroVinculo } = await admin.rpc("vincular_usuario_ao_convite", {
      p_convite_id: convite_id,
      p_user_id: userId,
    });
    if (erroVinculo) {
      console.error("falha ao vincular perfil:", erroVinculo.message);
      return erro("FALHA_INTERNA", 500);
    }

    // generateLink gera o token e devolve; não envia e-mail. Usamos
    // `hashed_token` em vez de `email_otp` para não depender do tamanho do
    // código configurado no painel.
    const { data: link, error: erroLink } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const hashedToken = link?.properties?.hashed_token;
    if (erroLink || !hashedToken) {
      console.error("falha ao gerar link:", erroLink?.message);
      return erro("FALHA_INTERNA", 500);
    }

    const { data: sessao, error: erroVerificar } = await anonimo.auth.verifyOtp({
      token_hash: hashedToken,
      type: "magiclink",
    });
    if (erroVerificar || !sessao?.session) {
      console.error("falha ao verificar token:", erroVerificar?.message);
      return erro("FALHA_INTERNA", 500);
    }

    return json({
      access_token: sessao.session.access_token,
      refresh_token: sessao.session.refresh_token,
      papel,
      rotulo,
    });
  } catch (e) {
    console.error("erro inesperado no resgate:", e instanceof Error ? e.message : e);
    return erro("FALHA_INTERNA", 500);
  }
});
