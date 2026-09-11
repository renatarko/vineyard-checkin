-- E-mail real no convite.
--
-- Até aqui todo convidado virava um usuário com e-mail sintético
-- (c-<id>@<dominio>), que existe só porque o Supabase Auth exige um endereço.
-- Funciona, mas deixa o painel de Authentication ilegível e fecha a porta
-- para qualquer recuperação futura de acesso.
--
-- Agora o convite pode carregar o e-mail de quem vai usá-lo. Continua
-- OPCIONAL: quem não informa cai no sintético, e o fluxo é o mesmo — o link
-- segue sendo a credencial, e nenhum e-mail é enviado em momento algum.

alter table public.convites
  add column email text;

comment on column public.convites.email is
  'E-mail real da pessoa convidada. Nulo usa o endereço sintético. Nunca recebe mensagem: existe para o usuário do Auth ser identificável.';

-- Normaliza na entrada: e-mail que só difere por caixa ou espaço é a mesma
-- pessoa, e duplicaria o usuário no Auth a cada convite.
create or replace function public.normalizar_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  return new;
end;
$$;

create trigger convites_normaliza_email
  before insert or update on public.convites
  for each row execute function public.normalizar_email();

-- `consumir_convite` passa a devolver o e-mail, para a Edge Function saber
-- qual endereço usar ao criar o usuário.
--
-- Precisa de drop antes: o Postgres recusa `create or replace` quando o tipo
-- de retorno muda, e aqui a tabela de retorno ganhou uma coluna. Como tudo
-- roda na transação da migration, não há janela em que a função não exista.
drop function if exists public.consumir_convite(text, text, text);

create function public.consumir_convite(
  p_token text,
  p_user_agent text,
  p_ip text
)
returns table (convite_id uuid, papel text, rotulo text, auth_user_id uuid, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.convites c
     set usos                = c.usos + 1,
         resgatado_em        = coalesce(c.resgatado_em, now()),
         primeiro_user_agent = coalesce(c.primeiro_user_agent, p_user_agent),
         primeiro_ip         = coalesce(c.primeiro_ip, p_ip)
   where c.token_hash = encode(sha256(p_token::bytea), 'hex')
     and c.revogado_em is null
     and c.expira_em > now()
     and c.usos < c.max_usos
  returning c.id, c.papel, c.rotulo, c.auth_user_id, c.email;
end;
$$;

revoke all on function public.consumir_convite(text, text, text) from public, anon, authenticated;
