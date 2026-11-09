# Diário Alimentar

Site para registrar o que você come ao longo do dia, como se sentiu e as experiências com alimentos novos ou trocados. Os dados ficam em um banco PostgreSQL no Supabase.

O site é informativo: mostra o que foi registrado e não julga nada como bom ou ruim. Não há metas, calorias nem peso.

## O que ele faz

- **Meu diário**: um dia por vez, com seis refeições (café da manhã, lanche da manhã, almoço, lanche da tarde, jantar e ceia). Cada refeição pode ter várias ocorrências no mesmo dia e vários alimentos, cada um com quantidade, horário e observações. Também tem sentimentos (emoji e texto), pensamentos, observações e uma nota geral do dia. O que não foi preenchido aparece como "Não registrado".
- **Experiências alimentares**: "Alimento novo" ou "Substituição alimentar", com sentimentos, pensamentos, como foi depois e observações. Dá para registrá-las pela página própria ou sem sair da refeição.
- **Alimentos registrados**: o banco dos seus alimentos, com busca, ordenação, renomear no lugar e excluir. Avisa quando um nome parece repetido ("é o mesmo alimento?"). Cada alimento tem uma página com onde ele apareceu.
- **Histórico**: calendário mensal com os dias marcados, pesquisa por alimento e período, linha do tempo das experiências e um relatório com totais e gráficos.
- **Configurações**: baixar uma cópia de todos os dados (JSON).

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

O `setup.sql` é a soma, na ordem, dos três arquivos de `supabase/migrations/` (tabelas, funções e segurança). Se preferir, rode esses três em vez dele, um por vez. Nunca use os dois.

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

## Datas e fuso horário

"Hoje" e a hora atual sempre seguem o horário de Brasília (America/Sao_Paulo), mesmo que o computador esteja em outro fuso. Datas e horários das refeições são guardados como data e hora simples (sem fuso), e só o momento de criação do registro usa fuso.

## Estrutura de pastas

```
supabase/
  setup.sql               tudo em um arquivo, para colar no SQL Editor
  migrations/             os mesmos scripts, em 3 partes (tabelas, funções, segurança)
src/
  components/
    ui/                   botão, campos, painel lateral, diálogo de confirmação, avisos, esqueletos
    layout/               estrutura da página, menu lateral e cabeçalho
    meals/ experiences/   formulários e cartões de refeições e experiências
    foods/ feelings/      campo de alimento com sugestões; emojis de sentimentos
    calendar/ charts/     calendário mensal e gráficos
  pages/                  uma página por rota (history/ tem as abas do Histórico)
  services/               acesso ao Supabase (uma função por operação)
  hooks/                  consultas e ações com TanStack Query, foco, rolagem
  lib/                    datas, validação, mensagens de erro, regras de nomes de alimentos
  config/ types/          variáveis de ambiente e tipos
tests/db/                 testes do banco (precisam de um Postgres)
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

O site lê e grava quase tudo por funções SQL (`supabase/migrations/20261106000200_functions.sql`), que validam os dados no banco e fazem cada operação por completo ou não fazem.

## Testes

```
npm test            testes de unidade (datas, validação, nomes de alimentos, erros, serviços)
npm run typecheck   conferência de tipos
npm run build       conferência de tipos e build de produção
```

Os testes do banco e do navegador usam um Postgres local e um servidor de teste que imita a API do Supabase (`scripts/local-stack/`): `npm run local:db`, `npm run local:api`, `npm run local:test-db` e `npm run local:e2e`. Eles não fazem parte do site. O roteiro manual para o seu Supabase está no `TESTING.md`.

## Problemas comuns

Qualquer tela de erro tem **Detalhes técnicos** (status, código e a mensagem original do Supabase). Em **Configurações**, o botão **Testar conexão** faz o diagnóstico completo.

- **"O Supabase não aceitou a chave"** (HTTP 401, "Invalid API key"): a chave do `.env` está errada, cortada, com aspas ou espaços, ou é de outro projeto. Copie de novo a chave Publishable, cole em `VITE_SUPABASE_ANON_KEY` e reinicie o `npm run dev` (o Vite só lê o `.env` ao iniciar).
- **"O .env está com a chave secreta"**: troque pela chave Publishable (ou anon).
- **"O endereço do Supabase parece errado"** (HTTP 404): `VITE_SUPABASE_URL` deve ser só `https://SEU-PROJETO.supabase.co`, sem `/rest/v1` e sem `/` no final.
- **"O Supabase não está liberando o schema public"**: em **Project Settings > Data API**, confira que `public` está em **Exposed schemas**.
- **"Falta conectar o banco de dados"**: `.env` ausente ou com nome errado. Reinicie o `npm run dev` depois de editar.
- **"Could not find the function public.…" ou erro 404 ao carregar dados**: os scripts SQL não foram rodados, ou foram rodados em outro projeto. Repita o passo 2. Se acabou de rodar, espere alguns segundos: o Supabase recarrega o esquema.
- **"O banco de dados não respondeu"**: projetos gratuitos ficam pausados depois de uma semana sem uso. Abra o painel do Supabase e clique em **Restore project**.
- **Erro 404 ao recarregar uma página publicada**: falta a regra de redirecionamento para `index.html` (já incluída para Netlify e Vercel).
