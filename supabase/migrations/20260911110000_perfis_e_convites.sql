-- Acesso da equipe de credenciamento.
--
-- Não há login por e-mail neste projeto: o convite é um link único, copiado e
-- enviado por WhatsApp. O token vive só no link; o banco guarda o SHA-256.
-- Quem tem o link entra — por isso todo convite nasce com um uso só e prazo
-- curto, e a revogação é imediata (ver `revogar_convite`).

-- ---------------------------------------------------------------- configuração

-- Singleton: o `check (id)` garante que só existe a linha `true`.
create table public.configuracao (
  id             boolean primary key default true check (id),
  evento_nome    text        not null default 'Vineyard',
  -- Desligar isto trava toda escrita depois do evento, sem mexer em código.
  checkin_aberto boolean     not null default true,
  atualizado_em  timestamptz not null default now()
);
insert into public.configuracao (id) values (true);

-- ---------------------------------------------------------------------- perfis

-- Espelha auth.users com o papel no evento. É esta tabela, e não o JWT, que
-- decide acesso: desligar `ativo` corta a pessoa na consulta seguinte, mesmo
-- que o token dela ainda seja válido por semanas.
create table public.perfis (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text        not null,
  papel     text        not null check (papel in ('admin', 'operador')),
  ativo     boolean     not null default true,
  criado_em timestamptz not null default now()
);

-- -------------------------------------------------------------------- convites

create table public.convites (
  id           uuid primary key default gen_random_uuid(),
  -- Só o hash. O token bruto aparece uma única vez, na tela de quem criou:
  -- se a pessoa fechar sem copiar, o caminho é criar outro convite.
  token_hash   text        not null unique,
  rotulo       text        not null,
  papel        text        not null check (papel in ('admin', 'operador')),
  expira_em    timestamptz not null default now() + interval '48 hours',
  revogado_em  timestamptz,
  max_usos     integer     not null default 1 check (max_usos >= 1),
  usos         integer     not null default 0,
  auth_user_id uuid references auth.users(id) on delete set null,
  resgatado_em timestamptz,
  -- Gravados no primeiro resgate para auditoria, nunca para bloquear: travar
  -- por fingerprint derruba o operador que troca de 4G para o wi-fi na porta.
  primeiro_user_agent text,
  primeiro_ip         text,
  criado_por   uuid references auth.users(id) on delete set null,
  criado_em    timestamptz not null default now()
);

create index convites_auth_user on public.convites (auth_user_id);

-- ------------------------------------------------------- funções de autorização

-- SECURITY DEFINER para não recursar na política de `perfis`: uma policy que
-- consultasse `perfis` diretamente chamaria a si mesma.
create or replace function public.is_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis where user_id = auth.uid() and ativo
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where user_id = auth.uid() and ativo and papel = 'admin'
  );
$$;

revoke all on function public.is_equipe() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_equipe() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------------------- RLS

alter table public.configuracao enable row level security;
alter table public.perfis       enable row level security;
alter table public.convites     enable row level security;

-- Regra do projeto: nenhuma policy usa `auth.uid() is not null`. Uma sessão
-- sem linha ativa em `perfis` não enxerga nada.
create policy "equipe lê configuração" on public.configuracao
  for select using (public.is_equipe());
create policy "admin edita configuração" on public.configuracao
  for update using (public.is_admin()) with check (public.is_admin());

create policy "vê o próprio perfil, admin vê todos" on public.perfis
  for select using (user_id = auth.uid() or public.is_admin());
-- Sem policy de escrita: `perfis` só muda por RPC security definer.

create policy "admin gerencia convites" on public.convites
  for all using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------- RPCs de convite

-- Usada pela página pública /convite/:token, antes de existir sessão. Devolve
-- só o necessário para montar o botão. Token inválido, expirado, revogado e
-- esgotado devolvem todos zero linhas de propósito: a tela mostra a mesma
-- mensagem para os quatro casos, para não virar oráculo de tokens válidos.
create or replace function public.validar_convite(p_token text)
returns table (rotulo text, papel text)
language sql
stable
security definer
set search_path = public
as $$
  select c.rotulo, c.papel
  from public.convites c
  where c.token_hash = encode(sha256(p_token::bytea), 'hex')
    and c.revogado_em is null
    and c.expira_em > now()
    and c.usos < c.max_usos;
$$;

grant execute on function public.validar_convite(text) to anon, authenticated;

-- Consome o convite. Validação e incremento na MESMA instrução: em dois
-- resgates simultâneos, o segundo não enxerga `usos` desatualizado e o
-- max_usos não fura.
create or replace function public.consumir_convite(
  p_token text,
  p_user_agent text,
  p_ip text
)
returns table (convite_id uuid, papel text, rotulo text, auth_user_id uuid)
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
  returning c.id, c.papel, c.rotulo, c.auth_user_id;
end;
$$;

-- Só a Edge Function (service role) executa. Nem anon nem authenticated.
revoke all on function public.consumir_convite(text, text, text) from public, anon, authenticated;

-- Fecha o resgate: amarra o usuário ao convite e cria/reativa o perfil.
create or replace function public.vincular_usuario_ao_convite(
  p_convite_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_papel  text;
  v_rotulo text;
begin
  select papel, rotulo into v_papel, v_rotulo
  from public.convites where id = p_convite_id;

  if v_papel is null then
    raise exception 'CONVITE_INEXISTENTE';
  end if;

  update public.convites
     set auth_user_id = p_user_id
   where id = p_convite_id;

  insert into public.perfis (user_id, nome, papel, ativo)
  values (p_user_id, v_rotulo, v_papel, true)
  on conflict (user_id) do update
    set papel = excluded.papel,
        ativo = true;
end;
$$;

revoke all on function public.vincular_usuario_ao_convite(uuid, uuid) from public, anon, authenticated;

-- Revogar tem que cortar o acesso AGORA. Invalidar o refresh token no GoTrue
-- é papel da Edge Function; o corte que vale é `perfis.ativo = false`, porque
-- a RLS consulta isso a cada query.
create or replace function public.revogar_convite(p_convite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO';
  end if;

  update public.convites
     set revogado_em = coalesce(revogado_em, now())
   where id = p_convite_id
  returning auth_user_id into v_user_id;

  if v_user_id is not null then
    update public.perfis set ativo = false where user_id = v_user_id;
  end if;
end;
$$;

grant execute on function public.revogar_convite(uuid) to authenticated;
