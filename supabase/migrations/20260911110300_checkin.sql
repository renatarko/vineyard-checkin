-- Credenciamento na portaria.
--
-- Toda escrita em `participantes` passa por aqui: a tabela não tem policy de
-- INSERT/UPDATE, então estas funções são o único caminho — e é nelas que ficam
-- as travas de papel, de evento fechado, e a garantia de que nome_origem nunca
-- é sobrescrito.

create table public.checkin_eventos (
  id              bigserial primary key,
  participante_id uuid not null references public.participantes(id) on delete cascade,
  acao            text not null check (acao in ('credenciou', 'desfez', 'editou_nome')),
  nome_real       text,
  ator            uuid references auth.users(id) on delete set null,
  em              timestamptz not null default now()
);

create index checkin_eventos_participante
  on public.checkin_eventos (participante_id, em desc);

alter table public.checkin_eventos enable row level security;

-- Não existe tela de relatório: isto é para responder "essa pessoa jura que
-- entrou e o sistema diz que não".
create policy "admin lê eventos" on public.checkin_eventos
  for select using (public.is_admin());

-- Espaços colapsados e limite de tamanho: o campo é digitado no celular, com
-- pressa, e vira parte do nome de exibição impresso no crachá.
create or replace function public.limpar_nome(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '');
$$;

create or replace function public.exigir_evento_aberto()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_equipe() then
    raise exception 'SEM_PERMISSAO';
  end if;
  if not (select checkin_aberto from public.configuracao where id) then
    raise exception 'EVENTO_FECHADO';
  end if;
end;
$$;

grant execute on function public.exigir_evento_aberto() to authenticated;

-- Credencia. IDEMPOTENTE de propósito: chamar duas vezes não move o
-- checkin_em. É isso que torna seguro o retry automático do front quando a
-- rede do salão engasga no meio da fila.
create or replace function public.credenciar(
  p_id uuid,
  p_nome_real text default null
)
returns public.participantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := public.limpar_nome(p_nome_real);
  v_linha public.participantes;
  v_ja_tinha boolean;
begin
  perform public.exigir_evento_aberto();

  if v_nome is not null and char_length(v_nome) > 120 then
    raise exception 'NOME_MUITO_LONGO';
  end if;

  select checkin_em is not null into v_ja_tinha
  from public.participantes where id = p_id;

  if v_ja_tinha is null then
    raise exception 'PARTICIPANTE_INEXISTENTE';
  end if;

  update public.participantes
     set nome_real     = coalesce(v_nome, nome_real),
         nome_real_em  = case when v_nome is not null then now() else nome_real_em end,
         nome_real_por = case when v_nome is not null then auth.uid() else nome_real_por end,
         -- coalesce: um segundo credenciar não reescreve a hora da entrada.
         checkin_em    = coalesce(checkin_em, now()),
         checkin_por   = coalesce(checkin_por, auth.uid()),
         atualizado_em = now()
   where id = p_id
  returning * into v_linha;

  if not v_ja_tinha then
    insert into public.checkin_eventos (participante_id, acao, nome_real, ator)
    values (p_id, 'credenciou', v_nome, auth.uid());
  elsif v_nome is not null then
    insert into public.checkin_eventos (participante_id, acao, nome_real, ator)
    values (p_id, 'editou_nome', v_nome, auth.uid());
  end if;

  return v_linha;
end;
$$;

grant execute on function public.credenciar(uuid, text) to authenticated;

-- Desfaz um check-in feito por engano. PRESERVA o nome_real: quem descobriu
-- quem é a pessoa descobriu de verdade, mesmo que tenha clicado errado.
create or replace function public.desfazer_credenciamento(p_id uuid)
returns public.participantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.participantes;
begin
  perform public.exigir_evento_aberto();

  update public.participantes
     set checkin_em    = null,
         checkin_por   = null,
         atualizado_em = now()
   where id = p_id
  returning * into v_linha;

  if v_linha.id is null then
    raise exception 'PARTICIPANTE_INEXISTENTE';
  end if;

  insert into public.checkin_eventos (participante_id, acao, ator)
  values (p_id, 'desfez', auth.uid());

  return v_linha;
end;
$$;

grant execute on function public.desfazer_credenciamento(uuid) to authenticated;

-- Identificar sem credenciar: dá para resolver a coletiva na fila, antes de a
-- pessoa chegar no balcão.
create or replace function public.atualizar_nome_real(p_id uuid, p_nome_real text)
returns public.participantes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := public.limpar_nome(p_nome_real);
  v_linha public.participantes;
begin
  perform public.exigir_evento_aberto();

  if v_nome is not null and char_length(v_nome) > 120 then
    raise exception 'NOME_MUITO_LONGO';
  end if;

  update public.participantes
     set nome_real     = v_nome,
         nome_real_em  = case when v_nome is not null then now() else null end,
         nome_real_por = case when v_nome is not null then auth.uid() else null end,
         atualizado_em = now()
   where id = p_id
  returning * into v_linha;

  if v_linha.id is null then
    raise exception 'PARTICIPANTE_INEXISTENTE';
  end if;

  insert into public.checkin_eventos (participante_id, acao, nome_real, ator)
  values (p_id, 'editou_nome', v_nome, auth.uid());

  return v_linha;
end;
$$;

grant execute on function public.atualizar_nome_real(uuid, text) to authenticated;
