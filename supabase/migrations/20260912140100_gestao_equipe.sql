-- Gestão da equipe pelo admin.
--
-- O acesso passa a ser por pré-cadastro: o admin registra nome e e-mail, e a
-- pessoa entra em /login com um código. Esta tabela é a lista de quem pode
-- entrar — quem não está aqui, ativo, não recebe código.
--
-- `perfis` continua sem policy de escrita: tudo passa por estas funções, que
-- é onde mora a checagem de papel.

-- Upsert do membro. Chamada pela Edge Function `cadastrar-membro` depois de
-- criar (ou reaproveitar) o usuário no Auth.
--
-- SEM checagem de is_admin() aqui de propósito: a função é revogada de todo
-- mundo e só a Edge Function com service role executa — e é lá que o JWT de
-- quem chamou é conferido. Repetir a checagem aqui quebraria isso, porque
-- service role não tem auth.uid().
create or replace function public.registrar_membro(
  p_user_id uuid,
  p_nome text,
  p_email text,
  p_papel text
)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome  text := public.limpar_nome(p_nome);
  v_linha public.perfis;
begin
  if v_nome is null then
    raise exception 'NOME_OBRIGATORIO';
  end if;
  if p_papel not in ('admin', 'operador') then
    raise exception 'PAPEL_INVALIDO';
  end if;
  if nullif(btrim(coalesce(p_email, '')), '') is null then
    raise exception 'EMAIL_OBRIGATORIO';
  end if;

  -- Recadastrar alguém que existe atualiza os dados e REATIVA: é o que o
  -- admin espera ao cadastrar de novo quem tinha saído da equipe.
  insert into public.perfis (user_id, nome, email, papel, ativo)
  values (p_user_id, v_nome, p_email, p_papel, true)
  on conflict (user_id) do update
     set nome  = excluded.nome,
         email = excluded.email,
         papel = excluded.papel,
         ativo = true
  returning * into v_linha;

  return v_linha;
end;
$$;

revoke all on function public.registrar_membro(uuid, text, text, text) from public, anon, authenticated;

-- Troca o papel de alguém.
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

  -- Um admin rebaixando a si mesmo perderia a tela de equipe no mesmo clique,
  -- e num evento com um admin só a saída seria o SQL Editor.
  if p_user_id = auth.uid() and p_papel <> 'admin' then
    raise exception 'NAO_PODE_REBAIXAR_A_SI_MESMO';
  end if;

  update public.perfis set papel = p_papel
   where user_id = p_user_id
  returning * into v_linha;

  if v_linha.user_id is null then
    raise exception 'PERFIL_INEXISTENTE';
  end if;

  return v_linha;
end;
$$;

grant execute on function public.definir_papel(uuid, text) to authenticated;

-- Liga e desliga o acesso.
--
-- Desativar é o corte real: `is_equipe()` lê `perfis.ativo` a cada consulta,
-- então a pessoa perde tudo na query seguinte, mesmo com o JWT ainda válido.
create or replace function public.definir_ativo(p_user_id uuid, p_ativo boolean)
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

  -- Mesma razão de `definir_papel`: ninguém se tranca para fora sozinho.
  if p_user_id = auth.uid() and not p_ativo then
    raise exception 'NAO_PODE_DESATIVAR_A_SI_MESMO';
  end if;

  update public.perfis set ativo = p_ativo
   where user_id = p_user_id
  returning * into v_linha;

  if v_linha.user_id is null then
    raise exception 'PERFIL_INEXISTENTE';
  end if;

  return v_linha;
end;
$$;

grant execute on function public.definir_ativo(uuid, boolean) to authenticated;

-- O convite (mantido como reserva) passa a gravar o e-mail no perfil quando
-- ele existe, para quem entrou por link também conseguir usar /login depois.
-- E-mail sintético continua de fora: não é caixa de entrada de verdade.
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
  v_email  text;
begin
  select papel, rotulo, email into v_papel, v_rotulo, v_email
  from public.convites where id = p_convite_id;

  if v_papel is null then
    raise exception 'CONVITE_INEXISTENTE';
  end if;

  update public.convites
     set auth_user_id = p_user_id
   where id = p_convite_id;

  insert into public.perfis (user_id, nome, email, papel, ativo)
  values (p_user_id, v_rotulo, v_email, v_papel, true)
  on conflict (user_id) do update
    set papel = excluded.papel,
        ativo = true,
        -- Não apaga um e-mail já cadastrado se o convite vier sem um.
        email = coalesce(excluded.email, public.perfis.email);
end;
$$;

revoke all on function public.vincular_usuario_ao_convite(uuid, uuid) from public, anon, authenticated;
