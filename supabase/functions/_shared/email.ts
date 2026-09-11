/**
 * Envio de e-mail pelo Resend.
 *
 * Não usamos o mailer do Supabase de propósito. Sem SMTP próprio ele manda 2
 * e-mails por hora e só entrega para membros da organização do projeto — ou
 * seja, a equipe de portaria não receberia nada. E há um efeito colateral
 * bem-vindo: com o mailer nativo inerte, `POST /auth/v1/otp` (que qualquer um
 * pode chamar, já que a chave anônima é pública) não consegue enviar nada. O
 * único caminho que entrega é este, e ele passa pela checagem de `perfis`.
 *
 * Mesmo desenho de `check-coral-essencia/supabase/functions/_shared/email.ts`.
 */

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const REMETENTE = Deno.env.get("RESEND_FROM_EMAIL") ?? "noreply@rerko.net";
const APP_NOME = Deno.env.get("APP_NOME") ?? "Credenciamento Vineyard";

/** Cores da marca, repetidas aqui porque e-mail não carrega CSS do projeto. */
const NAVY = "#081629";
const MAGENTA = "#840976";
const LARANJA = "#EF9709";

/**
 * Casca comum dos e-mails. Só o miolo muda entre um e outro; largura, cores,
 * cabeçalho e rodapé são iguais, e mantê-los em dois arquivos garantiria que
 * um dia divergissem.
 *
 * Tudo em tabela e estilo inline porque cliente de e-mail ignora folha de
 * estilo e, em boa parte dos casos, flexbox.
 */
export function layoutEmail({
  preTitulo,
  titulo,
  corpo,
}: {
  preTitulo: string;
  titulo: string;
  /** HTML já montado do miolo, entre o título e o rodapé. */
  corpo: string;
}): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="height:6px;line-height:6px;font-size:0;background-color:${LARANJA};">&nbsp;</td>
          </tr>
          <tr>
            <td style="background-color:${NAVY};padding:32px 40px;text-align:center;">
              <p style="margin:0;color:rgba(255,255,255,0.6);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${preTitulo}</p>
              <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;">${titulo}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              ${corpo}
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 32px;border-top:1px solid #e4e4e7;">
              <p style="margin:20px 0 0;color:#a1a1aa;font-size:12px;line-height:1.6;text-align:center;">
                ${APP_NOME}<br>
                Você recebeu este e-mail porque faz parte da equipe do evento.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Manda o e-mail. Devolve `false` em vez de lançar: quem chama decide o que
 * fazer, e nenhum caminho deve revelar ao cliente se o envio aconteceu —
 * isso diria quem tem acesso ao sistema.
 *
 * NUNCA logar o destinatário nem o conteúdo.
 */
export async function enviarEmail({
  para,
  assunto,
  html,
}: {
  para: string;
  assunto: string;
  html: string;
}): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY não configurada: nenhum e-mail sai daqui");
    return false;
  }

  try {
    const resposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${APP_NOME} <${REMETENTE}>`,
        to: [para],
        subject: assunto,
        html,
      }),
    });

    if (!resposta.ok) {
      console.error("Resend recusou o envio:", resposta.status);
      return false;
    }
    return true;
  } catch (e) {
    console.error("falha ao falar com o Resend:", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Botão em tabela: `<a>` estilizado some no Outlook. */
export function botao(texto: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td style="background-color:${MAGENTA};border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${texto}</a>
      </td>
    </tr>
  </table>`;
}

export { APP_NOME };
