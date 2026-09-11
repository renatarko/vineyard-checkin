-- Correções no modelo de pré-cadastro, todas encontradas antes de a tela existir.

-- ---------------------------------------------------------------------------
-- 1. `perfis.email` deixa de ser cópia e passa a ser espelho de auth.users
-- ---------------------------------------------------------------------------
-- Como cópia escrita pela aplicação, o valor sai de sincronia no dia em que
-- alguém editar o e-mail pelo painel do Auth — e o efeito é o pior possível:
-- com o endereço novo, `enviar-codigo` não acha o perfil; com o velho, o Auth
-- não acha o usuário. Nos dois casos a tela responde "enviamos um código" e
-- nada chega, sem deixar rastro de por quê.

create or replace function public.sincronizar_email_do_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.perfis
     set email = case
                   -- Endereços sintéticos de convite não são caixa de entrada
                   -- de ninguém: guardá-los faria alguém digitá-los no login e
                   -- esperar um código que nunca sai.
                   when new.email like 'c-%@%' then null
                   when new.email like '%@vineyard-checkin.rerko.net' then null
                   else lower(btrim(new.email))
                 end
   where user_id = new.id;
  return null;
exception when others then
  -- Um e-mail duplicado em `perfis` JAMAIS pode derrubar uma operação de
  -- autenticação: este trigger roda dentro da transação do Auth.
  return null;
end;
$$;

create trigger usuarios_sincroniza_email
  after update of email on auth.users
  for each row execute function public.sincronizar_email_do_perfil();

-- O seed local usa o domínio dos convites e escapou do filtro anterior.
update public.perfis
   set email = null
 where email like '%@vineyard-checkin.rerko.net';

-- ---------------------------------------------------------------------------
-- 2. Desativar precisa fechar os convites pendentes da pessoa
-- ---------------------------------------------------------------------------
-- Sem isso, desativar é teatro: `vincular_usuario_ao_convite` faz `ativo =
-- true` incondicionalmente, então quem foi desligado reabre o link que ainda
-- está no WhatsApp dela e volta sozinha. Quem foi desativado não pode ser
-- quem desfaz a desativação.
--
-- Ganha também a guarda de último admin: sem ela, um admin desativa o outro,
-- ninguém mais administra o evento e a saída vira o SQL Editor.
create or replace function public.definir_ativo(p_user_id uuid, p_ativo boolean)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.perfis;
  v_email text;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_user_id = auth.uid() and not p_ativo then
    raise exception 'NAO_PODE_DESATIVAR_A_SI_MESMO';
  end if;

  update public.perfis set ativo = p_ativo
   where user_id = p_user_id
  returning * into v_linha;

  if v_linha.user_id is null then
    raise exception 'PERFIL_INEXISTENTE';
  end if;

  v_email := v_linha.email;

  if not p_ativo then
    update public.convites
       set revogado_em = coalesce(revogado_em, now())
     where revogado_em is null
       and (auth_user_id = p_user_id
            or (v_email is not null and email = v_email));
  end if;

  -- Conferido DEPOIS do update, na mesma transação: a exceção desfaz tudo.
  if not exists (select 1 from public.perfis where ativo and papel = 'admin') then
    raise exception 'PRECISA_DE_UM_ADMIN';
  end if;

  return v_linha;
end;
$$;

grant execute on function public.definir_ativo(uuid, boolean) to authenticated;

-- Mesma guarda de último admin ao rebaixar.
create or replace function public.definir_papel(p_user_id uuid, p_papel text)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.perfis;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_papel not in ('admin', 'operador') then
    raise exception 'PAPEL_INVALIDO';
  end if;
  if p_user_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'NAO_PODE_REBAIXAR_A_SI_MESMO';
  end if;

  update public.perfis set papel = p_papel
   where user_id = p_user_id
  returning * into v_linha;

  if v_linha.user_id is null then
    raise exception 'PERFIL_INEXISTENTE';
  end if;

  if not exists (select 1 from public.perfis where ativo and papel = 'admin') then
    raise exception 'PRECISA_DE_UM_ADMIN';
  end if;

  return v_linha;
end;
$$;

grant execute on function public.definir_papel(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Achar usuário por e-mail sem paginar o Auth
-- ---------------------------------------------------------------------------
-- `listUsers()` devolve 50 por página: numa base com mais que isso, o usuário
-- procurado simplesmente não aparece e a função conclui que ele não existe.
create or replace function public.usuario_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users
   where lower(email) = lower(btrim(p_email))
   limit 1;
$$;

revoke all on function public.usuario_por_email(text) from public, anon, authenticated;
