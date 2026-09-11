-- Participantes do evento, um por ingresso.
--
-- A regra que molda esta tabela: em inscrições coletivas, o fornecedor manda
-- todas as linhas com o nome (e o CPF) do comprador. Então nome e documento
-- NÃO identificam ninguém — cada linha é um ingresso, e quem de fato vai usar
-- aquele ingresso só se descobre na portaria.
--
-- O documento nunca aparece em claro aqui: só o HMAC, que serve para buscar e
-- para casar linhas na reimportação. O valor recuperável fica cifrado em
-- `participantes_documento`, tabela que a API não lê.

create table public.participantes (
  id uuid primary key default gen_random_uuid(),

  -- O nome que veio do CSV. IMUTÁVEL: nenhuma RPC de check-in o inclui num
  -- UPDATE. Numa coletiva ele é o nome do comprador, e é justamente por isso
  -- que precisa sobreviver — é a única forma de a portaria reencontrar o
  -- ingresso depois que o nome real for preenchido.
  nome_origem text not null,

  -- Informado na portaria, quando se descobre quem está usando o ingresso.
  nome_real text,

  -- A regra de exibição pedida: acrescenta, não substitui.
  --   sem nome_real           -> "Renata Karolina"
  --   com nome_real diferente -> "Ana Gabriela - Renata Karolina"
  --   com nome_real igual     -> "Renata Karolina"  (comprador que também vai;
  --                              sem este ramo sairia o nome repetido)
  -- lower/btrim/|| são IMMUTABLE, então cabem numa coluna gerada. A comparação
  -- que ignora acento fica no front, porque unaccent não cabe aqui.
  nome_exibicao text generated always as (
    case
      when nome_real is null or btrim(nome_real) = '' then nome_origem
      when lower(btrim(nome_real)) = lower(btrim(nome_origem)) then nome_origem
      else btrim(nome_real) || ' - ' || nome_origem
    end
  ) stored,

  -- HMAC-SHA256 do documento. String vazia quando não veio documento — e não
  -- o hash da string vazia, para todo mundo sem documento não colidir.
  documento_hash text not null default '',
  -- 'cpf' | 'cnpj' | null. Só o comprimento, nada que identifique.
  documento_tipo text check (documento_tipo in ('cpf', 'cnpj')),

  email             text,
  comprador_nome    text,
  fatura            text,
  -- Chave de agrupamento. Sem fatura, cai no documento, para os ingressos de
  -- uma mesma compra não se espalharem.
  fatura_norm       text not null,
  lote              text,

  -- md5(nome_normalizado | documento_hash). SÓ identidade: email, lote e
  -- comprador ficam de fora de propósito — eles são payload e mudam entre
  -- exportações sem que a pessoa tenha mudado.
  assinatura  text    not null,
  -- O n-ésimo ingresso com esta assinatura dentro desta fatura. É o que
  -- permite reimportar sem depender da ordem das linhas no arquivo.
  ocorrencia  integer not null,

  -- Coletiva: a fatura tem mais de um ingresso e o nome repete o do comprador.
  precisa_identificacao boolean not null default false,

  linha_csv  integer,
  -- Sumiu da planilha numa reimportação. Nunca apagamos a linha: se a pessoa
  -- já foi credenciada, apagar seria perder o registro de que ela entrou.
  sumido_em  timestamptz,

  checkin_em    timestamptz,
  checkin_por   uuid references auth.users(id) on delete set null,
  nome_real_em  timestamptz,
  nome_real_por uuid references auth.users(id) on delete set null,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Rede de segurança no nível do banco: se o algoritmo de importação tiver um
-- furo, o insert falha em vez de duplicar gente na lista.
create unique index participantes_chave
  on public.participantes (fatura_norm, assinatura, ocorrencia);

create index participantes_documento_hash on public.participantes (documento_hash);
create index participantes_fatura         on public.participantes (fatura_norm);
create index participantes_checkin        on public.participantes (checkin_em);

-- Valor cifrado do documento, separado de `participantes` de propósito: um
-- `select *` distraído do front não tem como arrastar o dado junto.
create table public.participantes_documento (
  participante_id uuid primary key
    references public.participantes(id) on delete cascade,
  cifrado         bytea       not null,
  criado_em       timestamptz not null default now()
);

-- Histórico de importações, para saber de onde veio cada leva.
create table public.importacoes (
  id            uuid primary key default gen_random_uuid(),
  arquivo_nome  text,
  linhas_total  integer,
  novos         integer,
  atualizados   integer,
  inalterados   integer,
  sumidos       integer,
  criado_por    uuid references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now()
);

alter table public.participantes            enable row level security;
alter table public.participantes_documento  enable row level security;
alter table public.importacoes              enable row level security;

-- RLS ligada e NENHUMA policy em participantes_documento: nem admin lê pela
-- API. Só service role, e só através de função que tem a chave.
revoke all on table public.participantes_documento from anon, authenticated;

-- Leitura para a equipe; NENHUMA policy de escrita. Todo write passa por RPC
-- SECURITY DEFINER, que é onde ficam as travas (papel, checkin_aberto, e a
-- garantia de que nome_origem e checkin_em não são sobrescritos).
create policy "equipe vê participantes" on public.participantes
  for select using (public.is_equipe());

create policy "admin vê importações" on public.importacoes
  for select using (public.is_admin());

-- Existe para uma eventual exigência legal, rodada à mão no SQL Editor.
-- A aplicação NUNCA chama isto.
create or replace function public.decifrar_documento(p_participante_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_cifrado bytea;
begin
  select cifrado into v_cifrado
  from public.participantes_documento
  where participante_id = p_participante_id;

  if v_cifrado is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(v_cifrado, public.chave_documento());
end;
$$;

revoke all on function public.decifrar_documento(uuid) from public, anon, authenticated;

-- Busca por documento.
--
-- O front não tem a chave do HMAC, então não consegue filtrar localmente por
-- CPF como faz com nome e fatura. Esta função calcula o hash dentro do banco e
-- devolve só os ids; o documento digitado passa por aqui em memória e não é
-- gravado nem registrado em log.
--
-- Exige o documento COMPLETO: hash só casa valor inteiro, busca parcial não
-- existe mais depois de criptografar.
create or replace function public.buscar_por_documento(p_texto text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_digitos text := public.so_digitos(p_texto);
begin
  if not public.is_equipe() then
    raise exception 'SEM_PERMISSAO';
  end if;

  if length(v_digitos) not in (11, 14) then
    return;
  end if;

  return query
    select p.id from public.participantes p
    where p.documento_hash = public.hash_documento(v_digitos);
end;
$$;

grant execute on function public.buscar_por_documento(text) to authenticated;

-- O contador ao vivo e as duas abas da portaria dependem disto.
alter publication supabase_realtime add table public.participantes;
