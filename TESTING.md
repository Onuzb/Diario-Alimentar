# Roteiro de testes no seu Supabase

Os testes automáticos rodaram em um Postgres local com um servidor de teste que imita a API do Supabase. Este roteiro confere o mesmo no **seu projeto Supabase de verdade**, que é o que o site usa. Leva uns 20 minutos.

Antes: scripts SQL rodados (README, passo 2), `.env` preenchido e `npm run dev` aberto. Se quiser começar do zero depois, apague os dados em **Table Editor** ou rode no SQL Editor:
`truncate meal_foods, food_experiences, meals, daily_diaries, foods cascade;`

Marque cada item. Se algo falhar, anote a tela, o que você fez e a mensagem que apareceu.

## 1. Conexão

- [ ] Em **Configurações > Testar conexão**, as duas linhas ("Endereço, chave e tabelas" e "Funções do app") ficam com ✔ ok. Se não ficarem, leia a mensagem e o texto técnico logo abaixo dela e corrija antes de seguir.
- [ ] A tela inicial abre com "Bom dia", "Boa tarde" ou "Boa noite" e a data de hoje (em horário de Brasília).
- [ ] Mostra "Nada registrado hoje ainda." e as seis refeições com "Não registrado".
- [ ] Nenhuma mensagem de erro vermelha aparece.

## 2. Diário

- [ ] **Meu diário** abre no dia de hoje. As seis refeições aparecem com "Não registrado".
- [ ] No café da manhã, clique em **Adicionar alimento**, digite "Pão integral", quantidade "2 fatias" e confirme. O site pergunta se é um alimento novo; confirme. O alimento aparece na refeição.
- [ ] Adicione um segundo alimento à mesma refeição ("Ovo mexido"). Continua sendo uma refeição só, com dois alimentos.
- [ ] Clique em **Adicionar outra ocorrência de café da manhã** e adicione "Café preto". Agora há duas ocorrências do café da manhã.
- [ ] No almoço, adicione "pao integral" (sem acento, minúsculo). O site pergunta "É o mesmo alimento?"; responda que sim. O almoço usa o "Pão integral" já existente.
- [ ] Adicione "Pão" ao almoço. O site avisa que é parecido com "Pão integral" e oferece usar o existente ou cadastrar como novo.
- [ ] Abra a edição do almoço, escolha dois emojis de sentimentos, escreva "Como me senti" e "O que pensei", mude o horário e salve. Tudo aparece no cartão.
- [ ] No jantar, clique em **Anotar como foi** e salve sem preencher nada: aparece um aviso. Escolha um emoji e salve: o jantar fica registrado sem alimentos.
- [ ] Edite a quantidade de um alimento. A mudança aparece.
- [ ] Remova um alimento: o diálogo cita o nome do alimento, o botão **Cancelar** já vem selecionado e **Esc** cancela. Confirme uma vez e ele some.
- [ ] Exclua uma ocorrência de refeição: o diálogo pede confirmação e a refeição some.
- [ ] Escreva uma observação geral do dia, salve, recarregue a página (F5): o texto continua lá.
- [ ] Use **Dia anterior**, **Próximo dia** e **Ir para hoje**. Um dia sem registro mostra as seis refeições como "Não registrado".
- [ ] Digite uma data impossível na barra de endereço (`/diario/2026-13-45`): o site volta para hoje.

## 3. Validação dos formulários

- [ ] Abra **Adicionar alimento** e comece a digitar: nenhum erro aparece enquanto você digita.
- [ ] Apague o texto e saia do campo: aparece o aviso de nome obrigatório. Digite uma letra: o aviso some.
- [ ] O botão de enviar nunca fica desabilitado: clicar com o campo vazio mostra o aviso.
- [ ] Com texto digitado, clique em fechar o painel: ele pergunta se quer descartar as alterações.

## 4. Experiências alimentares

- [ ] Em **Experiências alimentares**, tente salvar sem alimento: aparece o aviso.
- [ ] Registre "Kiwi" como **Alimento novo**, com sentimentos e textos. Aparece em "Experiências recentes".
- [ ] Registre "Granola" como **Substituição alimentar** no lugar de "Pão integral". O cartão mostra "No lugar de Pão integral".
- [ ] No diário, adicione "Abacate" a um lanche, clique em **Registrar nova experiência alimentar** e salve a experiência. O painel volta para a refeição e o alimento é adicionado.
- [ ] Edite uma experiência (lápis): os dados vêm preenchidos; salve uma mudança.
- [ ] Exclua uma experiência: o diálogo cita o alimento e a data.

## 5. Alimentos registrados

- [ ] A lista mostra os alimentos com primeiro registro, número de refeições e de experiências. Alimentos sem nenhum uso mostram "Sem registro".
- [ ] Ordene por **Mais registrados**; pesquise "pao" (acha "Pão integral"); pesquise algo que não existe e use **Limpar busca**.
- [ ] Cadastre "Manga" pelo campo no topo.
- [ ] Renomeie "Manga" no lugar (lápis): a linha não muda de tamanho nem empurra as outras. **Esc** cancela, **Enter** salva. Tentar um nome que já existe mostra um aviso.
- [ ] Excluir um alimento que tem experiência é bloqueado com explicação. Excluir um sem uso pede confirmação e remove.
- [ ] Abra um alimento: aparecem as refeições e as experiências dele.

## 6. Histórico

- [ ] No **Calendário**, os dias com registro têm pontos. Clique em um dia: ele aparece em leitura, com as seis refeições, experiências e observação do dia.
- [ ] Um dia vazio mostra "Não registrado" e o botão **Adicionar refeição**.
- [ ] Pesquise por alimento ("PAO"): acha sem diferenciar acento e maiúsculas. Uma pesquisa sem resultado mostra **Limpar filtros**.
- [ ] Coloque a data inicial depois da final: aparece um aviso e a pesquisa não roda.
- [ ] Na **Linha do tempo**, as experiências aparecem agrupadas por mês. Filtre por tipo e por alimento; **Limpar filtros** volta tudo.
- [ ] No **Relatório**, confira os totais, os dois gráficos e a lista de experiências. Teste **Este mês**, **Últimos 30 dias** e um período sem registros ("Nada registrado neste período"). O texto não deve julgar a alimentação.

## 7. Configurações

- [ ] **Baixar cópia dos dados** baixa um arquivo `diario-alimentar-AAAA-MM-DD.json` com seus alimentos, refeições e experiências.

## 8. Erros e carregamento

- [ ] Desligue a internet, recarregue **Alimentos registrados**: aparece um aviso de erro com **Tentar de novo**. Ligue de novo e clique nele.
- [ ] Com a internet desligada, tente salvar um alimento: aparece um aviso e o que você digitou continua no formulário.
- [ ] Digite um endereço que não existe (`/qualquer`): aparece "Página não encontrada".

## 9. Celular

No navegador, abra as ferramentas de desenvolvedor e simule um celular (375 px de largura), ou abra o site no seu telefone na mesma rede.

- [ ] Nenhuma página rola para o lado.
- [ ] O menu abre pelo botão de três linhas no topo e leva às páginas.
- [ ] Os painéis de adicionar alimento e de refeição ocupam a tela e dá para salvar.
- [ ] Os botões são fáceis de tocar.

## 10. Fuso horário (opcional)

- [ ] Mude o fuso do computador para outro país (por exemplo, Tóquio) e recarregue: "hoje" continua sendo o dia de Brasília.
