# Credenciamento de participantes — `vineyard-checkin`

> Plano de implementação. Escrito em 2026-09-11, antes da primeira linha de código.

## Contexto

Precisamos credenciar participantes de um evento a partir de um CSV com as colunas
`nome participante; cpf/cnpj; email; nome comprador; fatura; lote`.

O problema central é que, nas **inscrições coletivas**, todas as linhas vêm com o nome do
participante igual ao do comprador — e provavelmente com o CPF do comprador também. Isso
significa que **nem o nome nem o CPF servem como identidade**: cada linha do CSV é um
ingresso, e só na portaria é que se descobre quem de fato está usando aquele ingresso.

O que o sistema precisa entregar:

1. Marcar check-in de um participante específico, buscando por **nome, CPF ou fatura**.
2. Ao credenciar alguém de uma inscrição coletiva, **acrescentar o nome real sem apagar o
   original** — exibição `"Ana Gabriela - Renata Karolina"`, onde `Renata Karolina` é o nome
   que veio do CSV.
3. Dar acesso à equipe por **link de convite único**, copiado e enviado por WhatsApp — sem
   nenhuma infraestrutura de e-mail.
4. Contadores ao vivo de credenciados / total.

Projeto novo, diretório vazio. A stack segue o padrão já usado no `check-coral-essencia`:
Vite + React + TypeScript + shadcn/ui + Supabase com RLS e Edge Functions.

**Decisões já fechadas:** evento único (sem multi-tenant), importação por tela de upload,
convite por link copiado manualmente, só contadores (sem dashboard nem exportação), online
(sem offline-first). Nome do evento: **Vineyard**. Domínio dos e-mails sintéticos dos
convites: **`vineyard-checkin.rerko.net`** (ninguém recebe nada nesse endereço; ele existe
porque o Supabase Auth exige um e-mail por usuário).

---

## Arquitetura

### 1. Acesso por link de convite, sem e-mail

O link **é** a credencial. Fluxo:

1. Admin cria o convite em `/equipe`. O token (32 bytes, `crypto.getRandomValues`) é gerado
   no browser; **só o SHA-256 vai para o banco**. O token bruto aparece uma vez, para copiar.
2. A pessoa abre `/convite/:token`. A página chama a RPC pública `validar_convite(token)`,
   que devolve apenas `{rotulo, papel}` e mostra *"Entrar como Operador — Bia (portaria)"*.
3. **O resgate só acontece no clique do botão**, nunca no `useEffect`. Isso é essencial: o
   crawler de preview do WhatsApp faz um GET na URL, e com `max_usos = 1` um resgate
   automático queimaria o convite antes de a pessoa abrir. Crawler não aperta botão.
4. O clique chama a Edge Function `resgatar-convite`, que com service role: consome o
   convite (`consumir_convite` — valida e incrementa numa instrução só, contra corrida),
   cria/reusa um usuário do Supabase Auth com e-mail sintético
   (`c-<uuid>@convites.<dominio>`, `email_confirm: true`), gera a sessão via
   `admin.generateLink({type:'magiclink'})` → `properties.hashed_token` →
   `verifyOtp({token_hash, type:'magiclink'})`, faz upsert em `perfis` e devolve os tokens.
5. O front chama `supabase.auth.setSession(...)` e navega para `/` com `replace: true`, para
   o token sair do histórico e do `Referer`.

Detalhes que evitam retrabalho:

- **`generateLink` não envia e-mail** — só gera o token. Sem SMTP configurado, nada sai.
  É o mesmo mecanismo do `supabase/functions/send-otp/index.ts` do `check-coral-essencia`,
  mas usando `hashed_token` em vez de `email_otp`. Isso elimina a dependência do tamanho do
  código OTP configurado no painel (fonte do bug documentado em `src/hooks/useAuthOtp.ts`
  daquele repo).
- Na Edge Function, **dois clients separados**: um `admin` (service role,
  `persistSession:false`) e um `anon` só para o `verifyOtp` — não misturar papéis num client só.
- No painel: **desligar "Allow new users to sign up"**. E a regra dura: nenhuma policy pode
  ser `USING (auth.uid() IS NOT NULL)` — toda leitura passa por `is_equipe()`, que consulta
  `perfis.ativo`.

**Revogação.** Revogar convite não invalida a sessão já emitida (o refresh token dura
semanas). O gate real é o banco: revogar marca `perfis.ativo = false`, e a RLS nega na
consulta seguinte. Complementarmente chama-se `auth.admin.signOut(user_id, 'global')`.

**Mitigações do link vazado:** `max_usos = 1` por padrão (um link por pessoa, rótulo
obrigatório); `expira_em` de 48h; `primeiro_user_agent` e `primeiro_ip` gravados **para
auditoria, não para bloqueio** (fingerprint como trava produz falso negativo quando o
celular troca de 4G para wifi na porta do evento, e ficamos sem operador na fila); toggle
global `configuracao.checkin_aberto` para travar toda escrita depois do evento.

**Bootstrap do primeiro admin:** um `INSERT` no SQL Editor do Supabase com um token
escolhido na hora, depois abrir `/convite/<esse-token>`. Nunca commitar o token.

### 2. Identidade do participante e nome de exibição

`participantes` guarda **duas colunas de nome**:

- `nome_origem` — o que veio do CSV. **Imutável**: nenhuma RPC de check-in o inclui no `UPDATE`.
- `nome_real` — informado na portaria, editável.

`nome_exibicao` é **coluna gerada `STORED`**:

| `nome_real` | `nome_origem` | exibição |
|---|---|---|
| `null` | `Renata Karolina` | `Renata Karolina` |
| `Ana Gabriela` | `Renata Karolina` | `Ana Gabriela - Renata Karolina` |
| `Renata Karolina` | `Renata Karolina` | `Renata Karolina` |

A terceira linha é o caso que a regra ingênua não cobre: quando o comprador é ele mesmo um
dos participantes, ela produziria `"Renata Karolina - Renata Karolina"`.

(`lower`, `btrim` e `||` são `IMMUTABLE` e podem entrar na coluna gerada. `unaccent` é
`STABLE` e **não pode** — a comparação insensível a acento fica na função pura do front.)

### 3. Importação idempotente — a parte que mais pode dar errado

A chave óbvia — `(fatura, posição da linha)` — **é insegura** e foi descartada: se o
exportador reordenar as linhas ou se uma linha cancelada sumir do meio, as posições
deslizam e o check-in da pessoa 3 passa a valer para a pessoa 2. Corrupção silenciosa, no
meio do evento.

A chave correta é um **multiconjunto com ocorrência**: `(fatura_norm, assinatura, ocorrencia)`

- `assinatura = md5(nome_normalizado || '|' || documento_hash)` — **só identidade**.
  `email`, `lote` e `comprador` ficam de fora; são *payload*, atualizados sobre a linha casada.
- `ocorrencia` = o n-ésimo ingresso com aquela assinatura dentro daquela fatura.

Isso é invariante a reordenação (linhas de assinatura idêntica são intercambiáveis por
definição) e a lotes novos. O casamento é um `FULL OUTER JOIN` entre o CSV e a tabela.

**O detalhe que torna isso seguro:** quando uma fatura tinha 3 ingressos idênticos e o CSV
novo traz 2, não dá para saber qual foi cancelado — e tanto faz, *exceto* que um deles pode
já estar credenciado. Por isso as linhas existentes são ranqueadas por importância antes do
join:

```sql
row_number() over (
  partition by fatura_norm, assinatura
  order by (checkin_em is not null) desc,   -- credenciado sobrevive primeiro
           (nome_real  is not null) desc,   -- depois quem já foi identificado
           ocorrencia
)
```

Assim o "sumiu do CSV" cai sempre na linha intocada. Sem isso, uma reimportação no meio do
evento marcaria como ausente justamente quem já entrou.

**Invariantes da importação:**

- **Nunca `DELETE`.** Linha ausente ganha `sumido_em` e um badge. Se estiver credenciada,
  vira aviso vermelho no preview: *"2 pessoas já credenciadas sumiram da planilha"*.
- **`nome_real`, `checkin_em`, `checkin_por` e `nome_origem` jamais são tocados** — garantido
  estruturalmente (a RPC não lista essas colunas no `UPDATE`) e coberto por teste.
- **Preview e confirmação são a mesma função**, via `p_confirmar boolean`. Se o preview fosse
  calculado no front e a escrita fizesse outra coisa, os dois algoritmos divergiriam — é
  assim que importação duplica dados.
- `pg_advisory_xact_lock` na RPC: dois cliques em "Confirmar" não podem interleavar.
- Índice único em `(fatura_norm, assinatura, ocorrencia)` como rede de segurança no banco.
- Sem fatura → chave de grupo vira `'semfatura:' || documento_hash`.
- `precisa_identificacao` (a flag de coletiva) é recalculada por fatura:
  `count(*) por fatura > 1 AND nome_normalizado = comprador_normalizado`.

**Encoding:** exportadores brasileiros cospem `windows-1252` com frequência. Ler o arquivo
como `ArrayBuffer`, tentar `new TextDecoder('utf-8', {fatal:true})` e no `catch` refazer com
`windows-1252` — senão "José" vira "Jos&#65533;". Papaparse cuida do resto (BOM, `;` vs `,`
autodetectado, aspas com `;` dentro), mas **não** cuida de encoding.

### 4. CPF/CNPJ criptografado

**Requisito:** o documento nunca é gravado em claro e nunca volta em claro por nenhuma API.
A base guarda CPF e e-mail de terceiros; um vazamento da tabela não pode entregar os CPFs.

Duas representações, nenhuma delas legível:

| Coluna | O que é | Para quê |
|---|---|---|
| `participantes.documento_hash` | `HMAC-SHA256(dígitos, chave)`, hex | Buscar e casar linhas na reimportação. Determinístico, então serve de chave — e sem a chave não dá para testar CPFs contra ele |
| `participantes_documento.cifrado` | `pgp_sym_encrypt(dígitos, chave)` | Guardar de forma recuperável, para uma eventual exigência legal. **Nunca lido pela aplicação** |
| `participantes.documento_tipo` | `'cpf'` \| `'cnpj'` \| `null` | Rotular na tela sem revelar nada — deriva só do comprimento |

**Por que HMAC e não SHA-256 puro:** CPF tem 11 dígitos, um espaço pequeno o bastante para
varrer inteiro. Um hash sem chave seria reversível por força bruta em minutos. A chave
(*pepper*) mora no Supabase Vault, fora da tabela.

**Onde o valor em claro existe:** só em memória, dentro de funções `SECURITY DEFINER`,
durante a importação e durante uma busca por documento. Nunca é persistido, nunca é logado.

**A tabela do valor cifrado tem RLS ligada e ZERO policies** — nem admin lê pela API.
Isolar numa tabela separada, em vez de uma coluna a mais em `participantes`, evita que um
`select *` distraído do front arraste o dado junto.

**O que isso custa, e é consequência inevitável:**

- **A tela nunca mostra o CPF** — nem mascarado, porque os últimos dígitos também teriam de
  ser guardados em claro. A conferência na portaria passa a ser: o operador digita o
  documento e o sistema confirma se bate.
- **Busca parcial por CPF deixa de existir.** Hash só casa valor inteiro: a busca por
  documento exige os 11 ou 14 dígitos completos. Busca por nome, comprador, fatura e lote
  continua igual.
- **Perder a chave é perder os CPFs**, sem recuperação. Ela precisa de backup fora do
  Supabase, guardado como senha.

### 5. Busca

**Sem `pg_trgm`, sem `tsvector`.** Para centenas a poucos milhares de linhas, a lista inteira
é carregada no client (~300 KB para 3.000 pessoas), filtrada em memória por uma função pura
testada e mantida em dia por Realtime + react-query. A busca fica instantânea na fila da
portaria, aguenta a rede oscilar, e a lógica vira teste de Vitest.

**Busca por documento é a exceção** e não pode ser local: o front não tem a chave do HMAC.
Quando o termo digitado tem 11 ou 14 dígitos, a tela chama a RPC
`buscar_por_documento(texto)`, que calcula o HMAC dentro do banco e devolve só os `id`
correspondentes; o front cruza com a lista que já tem. Uma chamada, só quando o termo parece
documento — o resto da digitação continua sem tocar a rede.

No banco, btree em `documento_hash`, `fatura_norm` e `checkin_em`.

### 6. Auditoria

A UI mostra só contadores, como pedido. Mas incluímos `checkin_eventos` — tabela insert-only
de 5 colunas, escrita pela própria RPC — porque é a única resposta para *"essa pessoa jura
que entrou e o sistema diz que não"*. Custa ~12 linhas de SQL e não tem tela de relatório:
só um histórico dentro do detalhe do participante, visível para admin.

---

## Esquema do banco

Cinco migrations em `supabase/migrations/`:

| Arquivo | Conteúdo |
|---|---|
| `20260911100000_perfis_e_convites.sql` | `configuracao` (singleton), `perfis`, `convites`; funções `is_equipe()` / `is_admin()` (`SECURITY DEFINER`, para não recursar na policy de `perfis`); RPCs `validar_convite`, `consumir_convite`, `vincular_usuario_ao_convite`, `revogar_convite`; RLS |
| `20260911100050_documento_cripto.sql` | `pgcrypto`, chave no Vault, `chave_documento()`, `hash_documento()`, `cifrar_documento()`, tabela `participantes_documento` (RLS sem policies) |
| `20260911100100_participantes.sql` | `norm_texto()`, `so_digitos()`, `participantes` (com `nome_exibicao` gerada), `importacoes`, índices, RLS, Realtime |
| `20260911100200_importar_participantes.sql` | `importar_participantes(p_linhas jsonb, p_arquivo text, p_confirmar boolean)` |
| `20260911100300_checkin.sql` | `checkin_eventos` + RPCs `credenciar`, `desfazer_credenciamento`, `atualizar_nome_real` |

**Regra de escrita:** `participantes` tem policy de `SELECT` para a equipe e **nenhuma policy
de escrita** — todo write passa por RPC `SECURITY DEFINER` que checa `is_equipe()` e
`configuracao.checkin_aberto`. `credenciar` é idempotente (chamar duas vezes não altera
`checkin_em`), o que torna seguro o retry agressivo quando a rede engasgar.

Colunas principais de `participantes`: `nome_origem`, `nome_real`, `nome_exibicao` (gerada),
`documento_hash`, `documento_tipo`, `email`, `comprador_nome`, `fatura`, `fatura_norm`, `lote`,
`assinatura`, `ocorrencia`, `precisa_identificacao`, `linha_csv`, `sumido_em`, `checkin_em`,
`checkin_por`, `nome_real_em`, `nome_real_por`. O documento aparece só como `documento_hash`
e `documento_tipo` — o valor cifrado vive em `participantes_documento`.

---

## Arquivos a criar

**Scaffold** — `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`,
`tailwind.config.ts`, `postcss.config.js`, `components.json`, `eslint.config.js`,
`index.html`, `.gitignore`, `.env.example`, `vercel.json`, `AGENTS.md`.

Copiar `components.json` e `vercel.json` do `check-coral-essencia` (o rewrite SPA é idêntico).
`supabase/config.toml` deve ser o **gerado por `supabase init` completo** — não a linha única
daquele repo, que nunca rodou local — incluindo `[functions.resgatar-convite]`.

Duas ressalvas práticas do scaffold, para não brigar com as ferramentas:

- **`package.json` escrito à mão**, não `npm create vite`. O diretório já não está vazio (tem
  este `doc/`), e o template atual do `create-vite` traz Vite 7 + React 19 — fora do padrão
  que queremos manter.
- **Componentes shadcn copiados** de `check-coral-essencia/src/components/ui/`, não
  `npx shadcn init`. O CLI atual assume Tailwind v4 + React 19 e conflita com as versões
  fixadas. Copiar junto `src/lib/utils.ts` e os tokens de cor do `src/index.css`.

`.env.local` (fora do git) e `.env.example` (versionado) têm a forma:

```
VITE_SUPABASE_URL=""              # https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=""  # anon/publishable key
VITE_SUPABASE_PROJECT_ID=""       # <ref>
```

**Service role nunca entra no `.env` do front** — vive só como secret das Edge Functions
(`supabase secrets set`), e o CLI a injeta sozinho no `supabase functions serve` local.

**Supabase** — as 4 migrations acima, `supabase/seed.sql` (convite admin com token conhecido
+ ~40 participantes fake incluindo uma coletiva de 5), `supabase/functions/resgatar-convite/`,
`supabase/functions/revogar-acesso/`, `supabase/functions/_shared/cors.ts`.

**Libs puras — o coração testável** (`src/lib/`, cada uma com seu `.test.ts`):

| Arquivo | Responsabilidade |
|---|---|
| `nomes.ts` | `normalizarTexto`, `normalizarNomeDigitado`, `nomeExibicao`, `mesmoNome` |
| `documento.ts` | `soDigitos`, `tipoDocumento`, `pareceDocumentoCompleto` — sem formatar nem exibir: o valor nunca chega ao front |
| `csv.ts` | decode de encoding, papaparse, aliases de coluna, validação |
| `importacao.ts` | `assinatura`, `faturaNorm`, `detectarColetiva`, `diffImportacao` (espelho em TS do algoritmo SQL, usado nos testes como oráculo) |
| `busca.ts` | `filtrarParticipantes` |
| `convites.ts` | `linkDeConvite`, `estadoDoConvite` — modelar em `src/lib/links-cadastro.ts` do `check-coral-essencia` |

Mais `src/lib/utils.ts` (`cn`), `src/lib/types.ts`, `src/lib/auth-context.tsx`.

**Hooks** — `useResgatarConvite`, `useParticipantes` (lista completa + canal Realtime +
`refetchInterval` de fallback), `useCredenciamento`, `useImportacao`, `useConvites`.

**Páginas** — `Convite.tsx`, `Credenciamento.tsx` (`/`), `Importar.tsx`, `Equipe.tsx`,
`SemAcesso.tsx`, `NotFound.tsx`. Guards `RotaDaEquipe` / `RotaDeAdmin` em `App.tsx`,
modelados no `ProtectedRoute` do `check-coral-essencia/src/App.tsx` (guard é só UX — a RLS
é quem barra).

**Componentes** — `ContadorAoVivo`, `CardParticipante`, `SheetParticipante`, `GrupoFatura`,
`BarraAcoes`, `PreviewImportacao`, `AppLayout`, e só os `ui/` usados (button, input, card,
sheet, dialog, alert-dialog, label, badge, skeleton, sonner, separator, switch, tabs).

Seguir o padrão mobile-first do outro repo: listas como cards empilhados, barra de ação fixa
no rodapé.

**Dependências** — mesmas versões do `check-coral-essencia` (Vite ^5.4.19, React ^18.3.1,
react-router-dom ^6.30.1, `@supabase/supabase-js` ^2.100.1, react-query ^5.83, Tailwind
^3.4.17, lucide, sonner, react-hook-form + zod, Vitest ^3.2.4), **mais `papaparse` ^5.5** e
`@types/papaparse`.

**Não instalar:** recharts, embla, react-day-picker, jspdf/html2pdf, qrcode.react, input-otp,
date-fns (usar `Intl.DateTimeFormat`), vite-plugin-pwa.

---

## Fases

Ambiente já verificado: Node v22.20.0, npm 10.9.3, Supabase CLI 2.67.1, Docker 27.3.1.
Nada a instalar antes.

| # | Fase | Pronto quando |
|---|---|---|
| 0 | Scaffold + `supabase init` | `npm run dev` e `supabase start` sobem |
| 1 | As 4 migrations + seed | `supabase db reset` roda limpo repetidamente; `supabase gen types typescript --local > src/integrations/supabase/types.ts` |
| 2 | Libs puras + Vitest | ~60 testes verdes **antes de qualquer tela** — é aqui que coletiva e idempotência são resolvidas de verdade |
| 3 | Auth por convite | Edge Function, `/convite/:token`, `auth-context`, guards, `/sem-acesso` |
| 4 | Importação | Upload → decode → parse → mapeamento de colunas → preview → confirmar |
| 5 | Credenciamento | Contador, busca, cards, agrupamento por fatura, sheet com "nome real" + preview do `nome_exibicao`, credenciar/desfazer, Realtime |
| 6 | Equipe | Criar convite, copiar link, listar estado, revogar |
| 7 | Ensaio geral | Roteiro abaixo, com o CSV real |

---

## Verificação ponta a ponta

```bash
supabase start && supabase db reset && supabase functions serve
npm run dev
```

`.env.local` aponta para `http://127.0.0.1:54321`. Studio em `:54323`. Usar o Postgres do
Supabase em docker (17), não o `psql` local da máquina (14).

Roteiro manual, na ordem:

1. Abrir `/convite/<token-do-seed>` → mostra *"Entrar como Renata (admin)"*.
   **Recarregar e conferir que `usos` continua 0** — prova de que o crawler do WhatsApp não
   queima o convite.
2. Clicar → sessão criada, redireciona para `/`, URL sem token. Conferir 1 usuário em
   `auth.users` e a linha `admin` em `perfis`.
3. Abrir o mesmo link em janela anônima → recusado, com a **mesma** mensagem genérica de
   token inválido (a RPC não pode servir de oráculo sobre qual foi o motivo).
4. Importar CSV de teste com: coletiva de 5 linhas idênticas, acentos em `windows-1252`,
   separador `;`, BOM e um CPF formatado. Conferir o preview.
5. Confirmar. Credenciar 2 das 5 linhas da coletiva com nomes reais diferentes.
6. Reimportar **o mesmo arquivo** → 0 novos, 0 sumidos; `checkin_em` e `nome_real` intactos.
7. Reimportar **com as linhas embaralhadas** → mesmo resultado.
8. Reimportar **com 4 linhas na coletiva** → 1 sumido, e o sumido **não pode** ser nenhum dos
   2 credenciados.
9. Reimportar **com um lote novo** (+8 linhas) → 8 novos, 0 sumidos.
10. Duas abas; credenciar numa e ver o contador da outra mexer (Realtime).
11. Criar convite de operador, revogar, conferir que a sessão já aberta passa a receber lista
    vazia na consulta seguinte (RLS via `perfis.ativo`).
12. `configuracao.checkin_aberto = false` → credenciar falha com mensagem clara.
13. `select * from participantes` no Studio → **nenhuma coluna com CPF legível**.
14. `select * from participantes_documento` como admin pela API → **zero linhas** (RLS sem
    policy), e legível só via função com a chave.
15. Buscar pelo CPF completo de alguém do seed → acha. Buscar por um pedaço → não acha, com
    a tela explicando que o documento precisa estar completo.

**Cobertura de Vitest** (tudo função pura, < 2s):

- `nomes` — `nomeExibicao` nos três casos da tabela; nome vazio → nulo; limite de 120 chars.
- `documento` — CPF formatado, CNPJ, vazio, ausente.
- `csv` — BOM; header com acento/maiúscula; aliases (`cpf/cnpj`, `cpf`, `documento`); `;` e
  `,`; aspas com `;` dentro; linha vazia; coluna `nome` ausente → erro nomeado; utf-8 vs
  windows-1252; CRLF.
- `importacao` — **o mais importante, cada teste é uma regra de negócio**: assinatura estável
  a caixa/acento/espaço/CPF formatado; assinatura ignora email e lote; `detectarColetiva`;
  reimportação idêntica → `{novos:0, sumidos:0}`; **invariante de reordenação** (embaralhar o
  CSV não muda nada); **invariante de preservação** (nenhum registro com `checkin_em` ou
  `nome_real` entra em `sumidos` enquanto houver linha equivalente — testar 5→4 com 2
  credenciados); lote novo → só novos; fatura vazia agrupa por documento; faturas distintas
  com nomes iguais não se misturam.
- `busca` — acento nos dois sentidos; busca por `nome_real` e por `nome_origem`; CPF com
  pontos; fatura; termo vazio; não-credenciados antes de credenciados.
- `convites` — `estadoDoConvite` ativo/expirado/revogado/esgotado.

---

## Pontos que vale revisitar na implementação

- **Plano B do login**, se o `generateLink` der problema na prática: a Edge Function cria o
  usuário com senha aleatória de 32 chars, guarda na linha de `convites` (só alcançável por
  service role) e o front faz `signInWithPassword`. Menos peças móveis; troca de ~20 minutos
  e o resto da arquitetura não muda.
- **Correção de typo no CSV.** Hoje um nome corrigido pelo fornecedor vira "1 sumido + 1
  novo". Refinamento opcional para depois: quando as sobras de uma fatura forem exatamente 1
  novo e 1 sumido, a tela oferece *"é a mesma pessoa, corrigir o nome"* e o admin decide.
- **Chave de criptografia.** Fica no Supabase Vault e precisa de backup fora do Supabase,
  guardado como senha. Perder a chave é perder os CPFs — o HMAC continua servindo para
  busca e importação, mas o valor cifrado vira lixo irrecuperável. Rotacionar a chave exige
  reimportar o CSV, porque os hashes mudam junto.
- **LGPD.** Além da criptografia: nunca logar documento no `console.log` das Edge Functions
  (o `verify-otp` do outro repo loga e-mail e código — não repetir o padrão), e prever um
  `limpar_dados_do_evento()` para rodar depois do evento.
- **Evento único, porta encostada.** Nenhuma lógica deve depender de "só existe um evento";
  um `evento_id` futuro entra como coluna com default.
