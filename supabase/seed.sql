-- Seed do ambiente local. NÃO roda em produção (`supabase db reset` só afeta
-- o banco em docker).
--
-- Token de admin para desenvolvimento: abra
--   http://localhost:8080/convite/dev-admin-token-local-nao-usar-em-prod
-- Em produção, o primeiro admin é criado à mão no SQL Editor, com um token
-- que você escolhe na hora e não commita em lugar nenhum:
--   insert into public.convites (token_hash, rotulo, papel, max_usos, expira_em)
--   values (encode(sha256('SEU-SEGREDO-LONGO'::bytea), 'hex'),
--           'Renata (admin)', 'admin', 1, now() + interval '7 days');

insert into public.convites (token_hash, rotulo, papel, max_usos, expira_em)
values (
  encode(sha256('dev-admin-token-local-nao-usar-em-prod'::bytea), 'hex'),
  'Renata (admin)',
  'admin',
  5,                                   -- vários usos: o reset é frequente em dev
  now() + interval '365 days'
);

insert into public.convites (token_hash, rotulo, papel, max_usos, expira_em)
values (
  encode(sha256('dev-operador-token-local'::bytea), 'hex'),
  'Bia (portaria)',
  'operador',
  5,
  now() + interval '365 days'
);

-- Participantes de exemplo, montados pela própria função de importação para o
-- seed exercitar o mesmo caminho que a tela usa. Inclui:
--   - uma coletiva de 5 ingressos com nome == comprador (o caso central)
--   - uma coletiva de 2 com nomes reais distintos (não deve ser marcada)
--   - compras individuais
--   - uma linha sem fatura
--   - documentos formatados e acentos
do $$
declare
  v_linhas jsonb;
  v_admin  uuid;
begin
  -- A importação exige admin. No seed não há sessão, então criamos um usuário
  -- e um perfil de serviço só para o seed rodar pelo MESMO caminho que a tela
  -- usa — inclusive hasheando e cifrando os documentos.
  v_admin := gen_random_uuid();
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'seed@vineyard-checkin.rerko.net', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  insert into public.perfis (user_id, nome, papel, ativo)
  values (v_admin, 'Seed (dev)', 'admin', true);

  -- `is_admin()` lê auth.uid(); no seed não há JWT, então fingimos um.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_admin, 'role', 'authenticated')::text,
                     true);

  v_linhas := '[
    {"nome":"Marina Alves Ferreira","documento":"123.456.789-01","email":"marina@exemplo.com","comprador":"Marina Alves Ferreira","fatura":"INV-1001","lote":"1º lote"},
    {"nome":"Carlos Eduardo Nunes","documento":"234.567.890-12","email":"carlos@exemplo.com","comprador":"Carlos Eduardo Nunes","fatura":"INV-1002","lote":"1º lote"},

    {"nome":"Renata Karolina Rocha","documento":"345.678.901-23","email":"renata@exemplo.com","comprador":"Renata Karolina Rocha","fatura":"INV-1003","lote":"2º lote"},
    {"nome":"Renata Karolina Rocha","documento":"345.678.901-23","email":"renata@exemplo.com","comprador":"Renata Karolina Rocha","fatura":"INV-1003","lote":"2º lote"},
    {"nome":"Renata Karolina Rocha","documento":"345.678.901-23","email":"renata@exemplo.com","comprador":"Renata Karolina Rocha","fatura":"INV-1003","lote":"2º lote"},
    {"nome":"Renata Karolina Rocha","documento":"345.678.901-23","email":"renata@exemplo.com","comprador":"Renata Karolina Rocha","fatura":"INV-1003","lote":"2º lote"},
    {"nome":"Renata Karolina Rocha","documento":"345.678.901-23","email":"renata@exemplo.com","comprador":"Renata Karolina Rocha","fatura":"INV-1003","lote":"2º lote"},

    {"nome":"José Antônio Sá","documento":"456.789.012-34","email":"jose@exemplo.com","comprador":"Luciana Sá","fatura":"INV-1004","lote":"2º lote"},
    {"nome":"Luciana Sá","documento":"567.890.123-45","email":"luciana@exemplo.com","comprador":"Luciana Sá","fatura":"INV-1004","lote":"2º lote"},

    {"nome":"Paulo Henrique Lima","documento":"678.901.234-56","email":"paulo@exemplo.com","comprador":"Paulo Henrique Lima","fatura":"INV-1005","lote":"3º lote"},
    {"nome":"Ana Beatriz Souza","documento":"789.012.345-67","email":"ana@exemplo.com","comprador":"Ana Beatriz Souza","fatura":"INV-1006","lote":"3º lote"},
    {"nome":"Thiago Mendes","documento":"890.123.456-78","email":"thiago@exemplo.com","comprador":"Thiago Mendes","fatura":"","lote":"3º lote"},

    {"nome":"Construtora Vale LTDA","documento":"12.345.678/0001-99","email":"contato@vale.exemplo.com","comprador":"Construtora Vale LTDA","fatura":"INV-1007","lote":"Corporativo"},
    {"nome":"Construtora Vale LTDA","documento":"12.345.678/0001-99","email":"contato@vale.exemplo.com","comprador":"Construtora Vale LTDA","fatura":"INV-1007","lote":"Corporativo"},
    {"nome":"Construtora Vale LTDA","documento":"12.345.678/0001-99","email":"contato@vale.exemplo.com","comprador":"Construtora Vale LTDA","fatura":"INV-1007","lote":"Corporativo"}
  ]'::jsonb;

  perform public.importar_participantes(v_linhas, 'seed.csv', true);
end;
$$;
