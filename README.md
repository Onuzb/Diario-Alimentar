# Diário Alimentar

Site para registrar o que você come ao longo do dia, como se sentiu e as experiências com alimentos novos ou trocados. Os dados ficam em um banco PostgreSQL no Supabase.

O site é informativo: mostra o que foi registrado e não julga nada como bom ou ruim. Não há metas, calorias nem peso.

## O que ele faz

- **Meu diário**: um dia por vez, com seis refeições (café da manhã, lanche da manhã, almoço, lanche da tarde, jantar e ceia). Cada refeição pode ter várias ocorrências no mesmo dia e vários alimentos, cada um com quantidade, horário e observações. Também tem sentimentos (emoji e texto), pensamentos, observações e uma nota geral do dia. O que não foi preenchido aparece como "Não registrado", e dá para marcar **Não fiz** quando você pulou a refeição.
- **Experiências alimentares**: "Alimento novo" ou "Substituição alimentar", com sentimentos, pensamentos, como foi depois e observações. Dá para registrá-las pela página própria ou sem sair da refeição.
- **Alimentos registrados**: o banco dos seus alimentos, com busca, ordenação, renomear no lugar e excluir. Avisa quando um nome parece repetido ("é o mesmo alimento?"). Cada alimento tem uma página com onde ele apareceu.
- **Histórico**: calendário mensal com os dias marcados, pesquisa por alimento e período, linha do tempo das experiências e um relatório com totais e gráficos.
- **Lembretes de refeição**: o celular ou o computador avisa "Falta registrar" dentro do horário de cada refeição, mesmo com o site fechado. O aviso tem os botões **Registrar** e **Não fiz**, e os horários são editáveis em Configurações (veja a seção abaixo, que tem um passo a passo próprio).
- **Configurações**: horários e ativação dos lembretes, e uma cópia de todos os dados (JSON).

## Tecnologias

React 19, TypeScript, Vite, Tailwind CSS 4, React Router, TanStack Query, React Hook Form com Zod, Recharts e Supabase (PostgreSQL). Não existe servidor próprio: o navegador fala direto com o Supabase.

## Como rodar (passo a passo)

Você precisa do [Node.js](https://nodejs.org) 20.19 ou mais novo (ou 22.12 ou mais novo) e de uma conta gratuita no [Supabase](https://supabase.com).

### 1. Criar o projeto no Supabase

1. Entre em supabase.com, clique em **New project**, escolha um nome e uma senha para o banco (guarde a senha) e uma região próxima (por exemplo, São Paulo).
2. Espere uns dois minutos até o projeto ficar pronto.

### 2. Criar as tabelas

1. No painel do projeto, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/setup.sql` deste projeto, copie **tudo** e cole no editor.
3. Clique em **Run**. Deve aparecer "Success. No rows returned".

Rode isso **uma vez só**. Rodar de novo dá erro de "já existe", o que é inofensivo.

O `setup.sql` é a soma, na ordem, dos quatro arquivos de `supabase/migrations/` (tabelas, funções, segurança e lembretes). Se preferir, rode esses quatro em vez dele, um por vez. Nunca use os dois.

**Já criou o banco antes dos lembretes?** Então não rode o `setup.sql` de novo: rode **só** o arquivo `supabase/migrations/20261112000100_reminders.sql` (SQL Editor, New query, colar, Run). Ele acrescenta as tabelas novas e atualiza duas funções, sem mexer nos seus registros.

### 3. Conectar o site ao banco

1. No Supabase, abra **Project Settings > API Keys** (ou **API**, nos painéis mais antigos).
2. Copie a chave **Publishable** (começa com `sb_publishable_`). Nos painéis antigos, ela se chama **anon public** e começa com `eyJ`. Se precisar da aba "Legacy", ela fica ali.
3. Copie também a **Project URL** (em **Project Settings > Data API**, ou no botão **Connect** no topo do painel). Ela é só `https://algumacoisa.supabase.co`.
4. Na pasta do projeto, copie `.env.example` para `.env` e preencha, **sem aspas e sem espaços**:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Use só a chave Publishable (ou anon). Nunca use a **Secret key** nem a `service_role`: elas dão acesso total e não podem ir para o navegador. O site recusa e avisa se isso acontecer.

### 4. Instalar e abrir

```
npm install
npm run dev
```

Abra o endereço que aparecer (normalmente http://localhost:5173). Se a tela disser "Falta conectar o banco de dados", o `.env` não foi lido: confira o nome do arquivo e reinicie o `npm run dev`.

Depois de abrir, entre em **Configurações > Testar conexão**. O teste diz se o endereço, a chave, as tabelas e as funções estão certos. Se algo falhar, ele mostra a causa e o texto técnico do Supabase.

### 5. Conferir

Siga o `TESTING.md`: é um roteiro curto para passar por todas as funções no seu Supabase de verdade.

## Segurança: leia antes de publicar

**O diário não tem login**, por escolha para este primeiro uso individual. A chave `anon` vai dentro do JavaScript do site, então quem tiver o endereço do site e do projeto consegue ver e alterar os registros. O RLS (segurança por linha) está ligado, mas com uma política aberta (`uso_individual_sem_login`), definida em `supabase/migrations/20261106000300_security.sql`.

Por isso:

- Use no seu computador (`npm run dev`) ou publique em um endereço que só você conhece.
- Não coloque dados que você não aceitaria ver expostos.
- Para publicar para outras pessoas, adicione login antes (veja abaixo).

### Como adicionar login depois

1. Ative um provedor em **Authentication** no Supabase (e-mail, por exemplo).
2. Adicione `user_id uuid references auth.users default auth.uid()` às tabelas `foods`, `daily_diaries`, `meals`, `meal_foods` e `food_experiences`.
3. Troque a política `uso_individual_sem_login` por políticas com `using (user_id = auth.uid())`.
4. Revise as funções SQL (`supabase/migrations/20261106000200_functions.sql`): elas rodam com os direitos de quem chama (`security invoker`), então o RLS já vale dentro delas. Os índices únicos de `foods` e `daily_diaries` precisam incluir `user_id`.
5. No front, adicione as telas de entrada e proteja as rotas em `src/App.tsx`. O cliente está em `src/services/client.ts` (hoje com `persistSession: false`).

## Publicar o site (opcional)

`npm run build` gera a pasta `dist/`. Em Netlify ou Vercel, defina as duas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas configurações do projeto. O projeto já inclui `public/_redirects` (Netlify) e `vercel.json` (Vercel) para que recarregar uma página interna, como `/historico`, não dê erro 404. Releia a seção de segurança antes.

## Lembretes de refeição

Os horários padrão são: café da manhã 8h às 9h, lanche da manhã 9h às 10h, almoço 12h às 13h, lanche da tarde 16h às 17h, jantar 21h às 22h e ceia 23h à 1h. Você muda tudo em **Configurações > Horários das refeições** (inclusive desligar uma refeição).

**Como funciona.** A cada 5 minutos o Supabase chama uma função (`send-reminders`). Ela olha quais refeições estão dentro do horário e **ainda não têm registro nem "Não fiz"** e manda uma notificação ao seu aparelho. Cada horário avisa **duas vezes**: no meio dele e 10 minutos antes do fim (às 12h30 e às 12h50, no almoço padrão). Tocar no aviso abre o diário na refeição, com o painel de adicionar alimento já aberto. O botão **Não fiz** do aviso marca a refeição sem abrir nada. A ceia que passa da meia-noite conta como o dia em que começou.

Isso usa notificações do navegador (Web Push), que chegam com o site fechado. São três peças: o site (já pronto), a função no Supabase e o agendador. Faça uma vez:

### 1. Atualizar o banco

Banco novo: o `setup.sql` já inclui tudo. Banco antigo: rode só `supabase/migrations/20261112000100_reminders.sql` (veja o passo 2 de "Como rodar").

### 2. Gerar as chaves dos avisos

No terminal, dentro da pasta do projeto:

```
npm run vapid
```

Ele mostra uma chave **pública** e uma **privada**. Copie as duas para um bloco de notas. A privada nunca vai para o site, para o GitHub nem para a Vercel.

### 3. Colocar a chave pública no site

- **Local**: no `.env`, preencha `VITE_VAPID_PUBLIC_KEY=` com a chave pública e reinicie o `npm run dev`.
- **Vercel**: em **Settings > Environment Variables**, crie `VITE_VAPID_PUBLIC_KEY` (tipo **Config**, não Secret) com a chave pública. Depois faça um **Redeploy**, porque o Vite só lê as variáveis ao construir o site.

### 4. Publicar a função no Supabase

1. No painel do Supabase, abra **Edge Functions** e clique em **Deploy a new function** (pelo editor do painel).
2. Dê o nome exato `send-reminders` e cole todo o conteúdo de `supabase/functions/send-reminders/index.ts`. Publique.
3. Abra a função, vá em **Settings** (ou Details) e **desligue "Verify JWT"**. Sem isso o Supabase barra as chamadas com erro 401. A segurança fica por conta da senha do passo 5.
4. Em **Edge Functions > Secrets** (ou Project Settings > Edge Functions), crie quatro segredos:

| Nome | Valor |
| --- | --- |
| `VAPID_PUBLIC_KEY` | a chave pública do passo 2 |
| `VAPID_PRIVATE_KEY` | a chave privada do passo 2 |
| `VAPID_SUBJECT` | `mailto:seu-email@exemplo.com` |
| `CRON_SECRET` | uma senha longa inventada por você (anote: é a mesma do passo 5) |

Quem prefere o terminal: `supabase functions deploy send-reminders --no-verify-jwt` e `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=... CRON_SECRET=...`.

### 5. Agendar a cada 5 minutos

1. Em **Database > Extensions**, ative `pg_cron` e `pg_net` (o script também tenta ativar).
2. Abra `supabase/reminders-cron.sql`, troque `SEU-PROJETO` pelo código do seu projeto e `TROQUE-ESTA-SENHA` pelo mesmo `CRON_SECRET` do passo 4.
3. Cole no **SQL Editor** e rode. As consultas no fim do arquivo mostram se o agendamento está rodando e as últimas respostas.

Esse arquivo não está no `setup.sql` de propósito: ele leva a sua senha.

### 6. Ativar no seu aparelho

Abra o site publicado em **Configurações > Lembretes neste aparelho**, toque em **Ativar lembretes**, escolha **Permitir** e depois **Enviar aviso de teste**. Faça isso em cada aparelho que deve receber os avisos.

### Observações por aparelho

- **Android (Chrome, Edge, Firefox)**: funciona direto. Para ter um ícone de app, use o menu do navegador, **Instalar app** (ou Adicionar à tela inicial).
- **iPhone e iPad**: só funciona com o site instalado: no Safari, **Compartilhar > Adicionar à Tela de Início**, abra pelo ícone e ative por lá. O iOS não mostra os botões do aviso: tocar nele abre o diário, e o **Não fiz** fica no próprio diário.
- **Brave**: em Configurações > Privacidade, ative **Usar serviços do Google para mensagens push**, senão o navegador não consegue se inscrever.
- **Computador**: o navegador precisa estar aberto em segundo plano (ou o sistema, como no Chrome com o app instalado) para mostrar o aviso. No Windows, o modo **Não perturbe** esconde as notificações.
- Se o aviso de teste funciona mas os lembretes não chegam, veja se há refeições dentro do horário sem registro, e rode no SQL Editor `select * from cron.job_run_details order by start_time desc limit 5;` para ver se o agendador está rodando.

### Segurança

O diário continua sem login. Quem souber o endereço do site também consegue ativar avisos em outro aparelho: os avisos só dizem "Falta registrar: Almoço". Não coloque a chave privada nem o `CRON_SECRET` em nenhuma variável `VITE_` (elas ficam visíveis no site). Para desligar tudo, rode `select cron.unschedule('diario-lembretes');`.

## Datas e fuso horário

"Hoje" e a hora atual sempre seguem o horário de Brasília (America/Sao_Paulo), mesmo que o computador esteja em outro fuso. Datas e horários das refeições são guardados como data e hora simples (sem fuso), e só o momento de criação do registro usa fuso.

## Estrutura de pastas

```
supabase/
  setup.sql               tudo em um arquivo, para colar no SQL Editor
  migrations/             os mesmos scripts, em 4 partes (tabelas, funções, segurança, lembretes)
  functions/send-reminders/  a função que envia os avisos (Edge Function)
  reminders-cron.sql      agendador dos lembretes (você edita antes de rodar)
src/
  components/
    ui/                   botão, campos, painel lateral, diálogo de confirmação, avisos, esqueletos
    layout/               estrutura da página, menu lateral e cabeçalho
    reminders/            ativar avisos e editar os horários das refeições
    meals/ experiences/   formulários e cartões de refeições e experiências
    foods/ feelings/      campo de alimento com sugestões; emojis de sentimentos
    calendar/ charts/     calendário mensal e gráficos
  pages/                  uma página por rota (history/ tem as abas do Histórico)
  services/               acesso ao Supabase (uma função por operação)
  hooks/                  consultas e ações com TanStack Query, foco, rolagem
  lib/                    datas, validação, mensagens de erro, regras de nomes de alimentos
  config/ types/          variáveis de ambiente e tipos
public/                   ícones, manifest e sw.js (o service worker que recebe os avisos)
tests/db/                 testes do banco (precisam de um Postgres)
tests/edge/               testes da função de avisos (precisam do Deno)
scripts/local-stack/      ferramentas só para teste local (veja abaixo)
```

### Como os dados são guardados

| Tabela | Conteúdo |
| --- | --- |
| `foods` | Banco de alimentos (nome único ignorando maiúsculas e acentos) |
| `daily_diaries` | Um registro por dia, com a observação geral do dia |
| `meals` | Refeições do dia (tipo, horário, sentimentos, pensamentos, observações) |
| `meal_foods` | Alimentos de cada refeição (quantidade, horário, observações) |
| `food_experiences` | Experiências alimentares |
| `meal_schedule` | Horário de cada refeição para os lembretes (6 linhas) |
| `meal_skips` | Refeições marcadas como "Não fiz" |
| `push_subscriptions` | Aparelhos que ativaram os lembretes |
| `reminder_log` | Avisos já enviados (evita avisar duas vezes o mesmo) |

O site lê e grava quase tudo por funções SQL (`supabase/migrations/20261106000200_functions.sql`), que validam os dados no banco e fazem cada operação por completo ou não fazem.

## Testes

```
npm test            testes de unidade (datas, validação, nomes de alimentos, erros, serviços)
npm run typecheck   conferência de tipos
npm run build       conferência de tipos e build de produção
npm run test:edge   criptografia e assinatura dos avisos (precisa do Deno instalado)
npm run icons       refaz os ícones do app (só se você mudar o desenho)
```

Os testes do banco e do navegador usam um Postgres local e um servidor de teste que imita a API do Supabase (`scripts/local-stack/`): `npm run local:db`, `npm run local:api`, `npm run local:test-db`, `npm run local:e2e` e `npm run local:push-test` (a função de avisos de ponta a ponta). Eles não fazem parte do site. O roteiro manual para o seu Supabase está no `TESTING.md`.

## Problemas comuns

Qualquer tela de erro tem **Detalhes técnicos** (status, código e a mensagem original do Supabase). Em **Configurações**, o botão **Testar conexão** faz o diagnóstico completo.

- **"O Supabase não aceitou a chave"** (HTTP 401, "Invalid API key"): a chave do `.env` está errada, cortada, com aspas ou espaços, ou é de outro projeto. Copie de novo a chave Publishable, cole em `VITE_SUPABASE_ANON_KEY` e reinicie o `npm run dev` (o Vite só lê o `.env` ao iniciar).
- **"O .env está com a chave secreta"**: troque pela chave Publishable (ou anon).
- **"O endereço do Supabase parece errado"** (HTTP 404): `VITE_SUPABASE_URL` deve ser só `https://SEU-PROJETO.supabase.co`, sem `/rest/v1` e sem `/` no final.
- **"O Supabase não está liberando o schema public"**: em **Project Settings > Data API**, confira que `public` está em **Exposed schemas**.
- **"Falta conectar o banco de dados"**: `.env` ausente ou com nome errado. Reinicie o `npm run dev` depois de editar.
- **"Could not find the function public.…" ou erro 404 ao carregar dados**: os scripts SQL não foram rodados, ou foram rodados em outro projeto. Repita o passo 2. Se acabou de rodar, espere alguns segundos: o Supabase recarrega o esquema.
- **"O banco de dados não respondeu"**: projetos gratuitos ficam pausados depois de uma semana sem uso. Abra o painel do Supabase e clique em **Restore project**.
- **O botão Salvar fica girando**: agora a chamada é cancelada depois de 30 segundos e o site mostra o motivo (internet fora, projeto pausado). Se aparecer "demorou demais", atualize a página para ver se o registro entrou.
- **"A função send-reminders não foi encontrada"** (ao enviar o aviso de teste): a função não foi publicada com esse nome exato no Supabase.
- **"O Supabase recusou a chamada da função"**: falta desligar **Verify JWT** na função (passo 4 dos lembretes).
- **O botão Ativar lembretes diz que falta a chave**: `VITE_VAPID_PUBLIC_KEY` não está no site. Coloque-a e, na Vercel, faça um novo deploy.
- **Erro 404 ao recarregar uma página publicada**: falta a regra de redirecionamento para `index.html` (já incluída para Netlify e Vercel).
