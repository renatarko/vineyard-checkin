-- E-mail no perfil.
--
-- Até aqui o e-mail vivia só em `auth.users`, que a RLS não enxerga. Isso
-- custava duas coisas:
--
--   - a tela de equipe não conseguia listar quem tem acesso com o respectivo
--     e-mail, porque o front só lê `public`;
--   - `enviar-codigo` precisava varrer `listUsers()`, que pagina de 50 em 50,
--     para descobrir de quem era o endereço.
--
-- Com a coluna aqui, achar alguém pelo e-mail vira um SELECT, e a lista de
-- quem pode entrar passa a ser esta tabela — que é justamente o que o novo
-- fluxo de acesso precisa: quem não está aqui não recebe código.

alter table public.perfis
  add column email text;

comment on column public.perfis.email is
  'E-mail de acesso. É por ele que a pessoa entra em /login. Nulo nos perfis antigos, criados por convite sem e-mail.';

-- Mesma normalização que `convites` já usa: "Bia@x.com" e "bia@x.com" são a
-- mesma pessoa, e sem isto viram dois cadastros que brigam pelo mesmo login.
create trigger perfis_normaliza_email
  before insert or update on public.perfis
  for each row execute function public.normalizar_email();

-- Traz o que já existe de auth.users. A migration roda como superusuário, que
-- é o único contexto onde ler auth.users é permitido.
--
-- Os endereços sintéticos (c-<uuid>@<dominio>) ficam de fora de propósito:
-- eles foram inventados para satisfazer o Auth em convites sem e-mail, não
-- são caixas de entrada de verdade e não servem para receber código.
update public.perfis p
   set email = u.email
  from auth.users u
 where u.id = p.user_id
   and u.email is not null
   and u.email not like 'c-%@%';

-- Duas pessoas não podem dividir o mesmo e-mail — seria ambíguo decidir quem
-- entra. Índice parcial para os sintéticos (que se repetem por natureza) não
-- travarem a criação de convites sem e-mail.
create unique index perfis_email_unico
  on public.perfis (email)
  where email is not null;

create index perfis_email_busca on public.perfis (email) where ativo;
