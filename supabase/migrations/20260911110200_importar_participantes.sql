-- Importação idempotente do CSV.
--
-- O problema: o mesmo arquivo é importado várias vezes (lotes novos saem ao
-- longo da venda), e em coletivas várias linhas são byte a byte idênticas.
-- Precisamos casar cada linha do arquivo com a linha certa da tabela sem
-- depender da POSIÇÃO dela — se o exportador reordenar, ou se uma venda
-- cancelada sumir do meio, casar por posição faria o check-in de uma pessoa
-- escorregar para outra.
--
-- A chave é (fatura_norm, assinatura, ocorrencia): um multiconjunto. Linhas
-- de assinatura idêntica são intercambiáveis por definição, então casá-las em
-- qualquer ordem dá no mesmo — COM UMA EXCEÇÃO, que é o coração desta função:
-- quando sobram linhas na tabela (alguém cancelou), a que "some" tem que ser
-- uma linha intocada, nunca uma que já foi credenciada. Daí o ranking abaixo.
--
-- Preview e gravação são a MESMA função, chaveadas por p_confirmar. Se o
-- preview fosse calculado no front e a escrita fizesse outra coisa, os dois
-- algoritmos divergiriam — é assim que importação duplica gente.

create or replace function public.importar_participantes(
  p_linhas jsonb,
  p_arquivo text default null,
  p_confirmar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novos        integer := 0;
  v_atualizados  integer := 0;
  v_inalterados  integer := 0;
  v_sumidos      integer := 0;
  v_ignoradas    integer := 0;
  v_total        integer := 0;
  v_coletivas    integer := 0;
  v_resultado    jsonb;
begin
  if not public.is_admin() then
    raise exception 'SEM_PERMISSAO';
  end if;

  if jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'ENTRADA_INVALIDA';
  end if;

  -- Dois cliques em "Confirmar" não podem interleavar.
  perform pg_advisory_xact_lock(hashtext('importar_participantes'));

  -- ------------------------------------------------------------- entrada
  create temp table tmp_entrada on commit drop as
  with bruto as (
    select
      x.ord::integer                                as linha_csv,
      btrim(coalesce(x.l ->> 'nome', ''))           as nome_origem,
      -- O valor em claro existe só aqui, numa temp table que morre no commit.
      -- Nunca é gravado em participantes nem sai desta função.
      nullif(public.so_digitos(x.l ->> 'documento'), '')    as documento_claro,
      public.hash_documento(x.l ->> 'documento')            as documento_hash,
      public.tipo_documento(x.l ->> 'documento')            as documento_tipo,
      nullif(lower(btrim(coalesce(x.l ->> 'email', ''))), '') as email,
      nullif(btrim(coalesce(x.l ->> 'comprador', '')), '')   as comprador_nome,
      nullif(btrim(coalesce(x.l ->> 'fatura', '')), '')      as fatura,
      nullif(btrim(coalesce(x.l ->> 'lote', '')), '')        as lote
    from jsonb_array_elements(p_linhas) with ordinality as x(l, ord)
  ),
  com_chave as (
    select
      b.*,
      coalesce(
        nullif(public.norm_texto(b.fatura), ''),
        'semfatura:' || b.documento_hash
      ) as fatura_norm,
      md5(public.norm_texto(b.nome_origem) || '|' || b.documento_hash) as assinatura
    from bruto b
    where b.nome_origem <> ''      -- sem nome não há o que credenciar
  )
  select
    c.*,
    -- Coletiva: mais de um ingresso na fatura e o nome repetindo o comprador.
    (count(*) over (partition by c.fatura_norm) > 1
      and c.comprador_nome is not null
      and public.norm_texto(c.nome_origem) = public.norm_texto(c.comprador_nome)
    ) as precisa_identificacao,
    row_number() over (
      partition by c.fatura_norm, c.assinatura order by c.linha_csv
    ) as rank_csv
  from com_chave c;

  select jsonb_array_length(p_linhas) into v_total;
  v_ignoradas := v_total - (select count(*) from tmp_entrada);

  -- ------------------------------------------------------------ casamento
  create temp table tmp_casado on commit drop as
  with atual_rank as (
    select
      p.*,
      row_number() over (
        partition by p.fatura_norm, p.assinatura
        -- A ordem AQUI é a regra de negócio inteira. Quem já foi credenciado
        -- casa primeiro, depois quem já foi identificado, depois quem está
        -- ativo. Assim, se o CSV vier com menos linhas, o "sumiu" cai sempre
        -- numa linha intocada — e nunca em quem já entrou no evento.
        order by (p.checkin_em is not null) desc,
                 (p.nome_real is not null)  desc,
                 (p.sumido_em is null)      desc,
                 p.ocorrencia
      ) as rank_db
    from public.participantes p
  )
  select
    e.linha_csv,
    e.nome_origem,
    e.documento_claro,
    e.documento_hash,
    e.documento_tipo,
    e.email,
    e.comprador_nome,
    e.fatura,
    e.fatura_norm            as e_fatura_norm,
    e.lote,
    e.assinatura             as e_assinatura,
    e.precisa_identificacao,
    e.rank_csv,
    a.id                     as participante_id,
    a.fatura_norm            as a_fatura_norm,
    a.assinatura             as a_assinatura,
    a.ocorrencia             as a_ocorrencia,
    a.checkin_em,
    a.nome_real,
    a.nome_exibicao,
    a.sumido_em,
    -- Só o payload entra na comparação. Identidade (nome_origem, assinatura)
    -- e tudo que a portaria escreveu ficam de fora.
    (a.id is not null and (
        a.email                 is distinct from e.email
     or a.lote                  is distinct from e.lote
     or a.comprador_nome        is distinct from e.comprador_nome
     or a.fatura                is distinct from e.fatura
     or a.documento_hash        is distinct from e.documento_hash
     or a.documento_tipo        is distinct from e.documento_tipo
     or a.precisa_identificacao is distinct from e.precisa_identificacao
     or a.sumido_em             is not null
    )) as mudou
  from tmp_entrada e
  full outer join atual_rank a
    on a.fatura_norm = e.fatura_norm
   and a.assinatura  = e.assinatura
   and a.rank_db     = e.rank_csv;

  select
    count(*) filter (where participante_id is null),
    count(*) filter (where linha_csv is null and sumido_em is null),
    count(*) filter (where participante_id is not null and linha_csv is not null and mudou),
    count(*) filter (where participante_id is not null and linha_csv is not null and not mudou),
    count(*) filter (where linha_csv is not null and precisa_identificacao)
  into v_novos, v_sumidos, v_atualizados, v_inalterados, v_coletivas
  from tmp_casado;

  -- --------------------------------------------------------------- resumo
  v_resultado := jsonb_build_object(
    'confirmado',   p_confirmar,
    'linhas_total', v_total,
    'ignoradas',    v_ignoradas,
    'novos',        v_novos,
    'atualizados',  v_atualizados,
    'inalterados',  v_inalterados,
    'sumidos',      v_sumidos,
    'coletivas',    v_coletivas,
    -- Este é o alerta que a tela mostra em vermelho: gente que já passou pela
    -- portaria e não está mais na planilha. Vai completo, nunca truncado.
    'sumidos_credenciados', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', nome_exibicao, 'fatura', a_fatura_norm, 'checkin_em', checkin_em))
      from tmp_casado
      where linha_csv is null and checkin_em is not null
    ), '[]'::jsonb),
    'amostra_novos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', nome_origem, 'fatura', fatura, 'lote', lote,
               'coletiva', precisa_identificacao))
      from (select * from tmp_casado where participante_id is null
            order by linha_csv limit 50) s
    ), '[]'::jsonb),
    'amostra_sumidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', nome_exibicao, 'fatura', a_fatura_norm,
               'credenciado', checkin_em is not null))
      from (select * from tmp_casado
            where linha_csv is null and sumido_em is null limit 50) s
    ), '[]'::jsonb)
  );

  if not p_confirmar then
    return v_resultado;
  end if;

  -- ------------------------------------------------------------- gravação

  -- Atualiza só o payload. nome_origem, nome_real, checkin_em, checkin_por,
  -- assinatura e ocorrencia NÃO aparecem aqui, e é essa ausência que garante
  -- que reimportar no meio do evento não apaga o trabalho da portaria.
  update public.participantes p
     set email                 = c.email,
         lote                  = c.lote,
         comprador_nome        = c.comprador_nome,
         fatura                = c.fatura,
         documento_hash        = c.documento_hash,
         documento_tipo        = c.documento_tipo,
         precisa_identificacao = c.precisa_identificacao,
         linha_csv             = c.linha_csv,
         sumido_em             = null,
         atualizado_em         = now()
    from tmp_casado c
   where p.id = c.participante_id
     and c.linha_csv is not null
     and c.mudou;

  -- Some da planilha: marca, nunca apaga.
  update public.participantes p
     set sumido_em = now(), atualizado_em = now()
    from tmp_casado c
   where p.id = c.participante_id
     and c.linha_csv is null
     and p.sumido_em is null;

  -- Novos. A ocorrência continua de onde a tabela parou, para não colidir com
  -- o índice único quando uma fatura ganha mais ingressos da mesma pessoa.
  --
  -- Materializado antes de inserir porque o documento cifrado precisa saber
  -- EXATAMENTE qual linha nova é qual: juntar depois só por (fatura,
  -- assinatura) pegaria o grupo inteiro, inclusive as linhas antigas.
  create temp table tmp_novos on commit drop as
  select
    n.nome_origem,
    n.documento_claro,
    n.documento_hash,
    n.documento_tipo,
    n.email,
    n.comprador_nome,
    n.fatura,
    n.e_fatura_norm as fatura_norm,
    n.lote,
    n.e_assinatura  as assinatura,
    coalesce(base.maior, 0) + row_number() over (
      partition by n.e_fatura_norm, n.e_assinatura order by n.linha_csv
    ) as ocorrencia,
    n.precisa_identificacao,
    n.linha_csv
  from tmp_casado n
  left join lateral (
    select max(p.ocorrencia) as maior
    from public.participantes p
    where p.fatura_norm = n.e_fatura_norm and p.assinatura = n.e_assinatura
  ) base on true
  where n.participante_id is null;

  insert into public.participantes (
    nome_origem, documento_hash, documento_tipo, email, comprador_nome,
    fatura, fatura_norm, lote, assinatura, ocorrencia,
    precisa_identificacao, linha_csv
  )
  select
    nome_origem, documento_hash, documento_tipo, email, comprador_nome,
    fatura, fatura_norm, lote, assinatura, ocorrencia,
    precisa_identificacao, linha_csv
  from tmp_novos;

  -- Guarda o documento cifrado das linhas recém-criadas, casando pela chave
  -- única completa. Linha que já existia não é retocada: documento é
  -- identidade, e identidade não muda numa reimportação — se mudasse, seria
  -- outra assinatura e portanto outra pessoa.
  insert into public.participantes_documento (participante_id, cifrado)
  select p.id, public.cifrar_documento(n.documento_claro)
  from tmp_novos n
  join public.participantes p
    on  p.fatura_norm = n.fatura_norm
    and p.assinatura  = n.assinatura
    and p.ocorrencia  = n.ocorrencia
  where n.documento_claro is not null
  on conflict (participante_id) do nothing;

  insert into public.importacoes (
    arquivo_nome, linhas_total, novos, atualizados, inalterados, sumidos, criado_por
  ) values (
    p_arquivo, v_total, v_novos, v_atualizados, v_inalterados, v_sumidos, auth.uid()
  );

  return v_resultado;
end;
$$;

revoke all on function public.importar_participantes(jsonb, text, boolean) from public, anon;
grant execute on function public.importar_participantes(jsonb, text, boolean) to authenticated;
