-- CPF/CNPJ criptografado.
--
-- Requisito duro do projeto: o documento NUNCA é gravado em claro e NUNCA volta
-- em claro por nenhuma API. A base guarda documento de terceiros; um vazamento
-- da tabela não pode entregar os CPFs.
--
-- Duas representações, nenhuma legível:
--
--   documento_hash  HMAC-SHA256(dígitos, chave)  -> buscar e casar na importação
--   cifrado         pgp_sym_encrypt(dígitos)     -> guardar de forma recuperável
--
-- Por que HMAC e não SHA-256 puro: CPF tem 11 dígitos, um espaço pequeno o
-- bastante para varrer inteiro. Sem chave, o hash seria reversível por força
-- bruta em minutos. A chave (pepper) mora no Vault, fora da tabela.

create extension if not exists pgcrypto with schema extensions;

-- A chave vive no Vault. Em produção ela é criada uma vez, com
--   select vault.create_secret('<32+ bytes aleatórios>', 'documento_pepper');
-- e precisa de backup FORA do Supabase: perdê-la é perder os documentos.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'documento_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'documento_pepper');
  end if;
end;
$$;

-- Lê a chave. SECURITY DEFINER e sem grant para ninguém: só outras funções
-- definer conseguem chamar. Se esta função vazasse, o HMAC viraria decorativo.
create or replace function public.chave_documento()
returns text
language sql
stable
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'documento_pepper' limit 1;
$$;

revoke all on function public.chave_documento() from public, anon, authenticated;

-- Hash determinístico: a mesma pessoa dá sempre o mesmo valor, então serve de
-- chave de casamento na reimportação sem o valor em claro existir no banco.
-- Documento vazio vira string vazia — e não um hash de string vazia, para
-- todo mundo sem documento não colidir numa chave só.
create or replace function public.hash_documento(p_documento text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_digitos text := public.so_digitos(p_documento);
begin
  if v_digitos = '' then
    return '';
  end if;
  return encode(
    extensions.hmac(v_digitos, public.chave_documento(), 'sha256'),
    'hex'
  );
end;
$$;

revoke all on function public.hash_documento(text) from public, anon;
-- authenticated NÃO recebe grant: se a equipe pudesse calcular hashes à
-- vontade, poderia varrer o espaço de CPFs contra a lista. A busca passa por
-- `buscar_por_documento`, que devolve ids e não hashes.

-- 'cpf' | 'cnpj' | null. Deriva só do comprimento, não revela nada.
create or replace function public.tipo_documento(p_documento text)
returns text
language sql
immutable
set search_path = public
as $$
  select case length(public.so_digitos(p_documento))
           when 11 then 'cpf'
           when 14 then 'cnpj'
           else null
         end;
$$;

grant execute on function public.tipo_documento(text) to authenticated;

create or replace function public.cifrar_documento(p_documento text)
returns bytea
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_digitos text := public.so_digitos(p_documento);
begin
  if v_digitos = '' then
    return null;
  end if;
  return extensions.pgp_sym_encrypt(v_digitos, public.chave_documento());
end;
$$;

revoke all on function public.cifrar_documento(text) from public, anon, authenticated;
