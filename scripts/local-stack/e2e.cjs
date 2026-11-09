#!/usr/bin/env node
/**
 * Teste ponta a ponta no navegador (Playwright + Chromium) contra o app compilado,
 * falando com o servidor de teste (rest-shim.mjs) e o Postgres local.
 *
 * Passo a passo (4 terminais ou 4 comandos em segundo plano):
 *   npm run local:db
 *   npm run local:api
 *   VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=teste npx vite build --outDir /tmp/diario-e2e-dist
 *   npx vite preview --outDir /tmp/diario-e2e-dist --port 4173 &
 *   npm run local:e2e            (opcional: um filtro, ex.: npm run local:e2e -- alimentos)
 *
 * Variáveis: E2E_BASE, E2E_API, E2E_SHOTS (pasta das capturas de tela).
 */
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require('playwright')

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173'
const API = process.env.E2E_API || 'http://127.0.0.1:54321'
const SHOTS = process.env.E2E_SHOTS || path.join(os.tmpdir(), 'diario-e2e')
const ONLY = (process.argv[2] || '').toLowerCase()

fs.mkdirSync(SHOTS, { recursive: true })

const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const isoAdd = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const YESTERDAY = isoAdd(TODAY, -1)

const results = []
const consoleProblems = []
let ignoreConsole = false

async function post(pathname, body) {
  const res = await fetch(`${API}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json()
}

async function step(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY)) return
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`  ok   ${name}`)
  } catch (error) {
    const message = String(error && error.message ? error.message : error).split('\n').slice(0, 6).join('\n       ')
    results.push({ name, ok: false, message })
    console.log(`  FALHOU  ${name}\n       ${message}`)
    try {
      const file = path.join(SHOTS, `falha-${results.length}.png`)
      await currentPage.screenshot({ path: file, fullPage: true })
      console.log(`       captura: ${file}`)
    } catch {
      /* sem captura */
    }
    // Limpa o estado para a falha não contaminar os passos seguintes.
    try {
      await post('/__mode', { mode: 'ok' })
      ignoreConsole = false
      for (let i = 0; i < 3; i += 1) await currentPage.keyboard.press('Escape')
    } catch {
      /* ignora */
    }
  }
}

let currentPage

const slot = (page, type) => page.locator(`section[aria-labelledby="slot-${type}"]`)
const dialog = (page) => page.getByRole('dialog')
const confirmBox = (page) => page.getByRole('alertdialog')
const promptBox = (page) => page.getByRole('group', { name: 'Confirmar alimento' })
const toastText = (page, text) => page.getByText(text).first()

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function pageOverflows(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
}

/** Responde às perguntas de alimento ("é o mesmo?", "cadastrar?") até a lista sumir. */
async function answerFoodPrompts(page, scope, preferred = /Cadastrar|Sim, usar|Usar/) {
  for (let i = 0; i < 4; i += 1) {
    const prompt = scope.getByRole('group', { name: 'Confirmar alimento' }).first()
    const appeared = await prompt.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)
    if (!appeared) return
    await prompt.getByRole('button', { name: preferred }).first().click()
    await page.waitForTimeout(150)
  }
}

async function openAddFood(page, trigger, name, { quantity, time, notes } = {}) {
  await trigger.click()
  const dlg = dialog(page)
  await dlg.waitFor()
  await dlg.getByRole('combobox', { name: 'Alimento', exact: true }).fill(name)
  if (quantity) await dlg.getByLabel('Quantidade').fill(quantity)
  if (time) await dlg.getByLabel('Horário do consumo').fill(time)
  if (notes) await dlg.getByLabel('Observações').fill(notes)
  return dlg
}

async function submitAddFood(page, dlg, answer) {
  await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
  if (answer) await answerFoodPrompts(page, dlg, answer)
  await dlg.waitFor({ state: 'hidden' })
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true })
  const page = await context.newPage()
  currentPage = page
  page.setDefaultTimeout(8000)
  page.on('pageerror', (e) => consoleProblems.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignoreConsole) consoleProblems.push(`console.error: ${m.text()}`)
  })

  await post('/__reset')
  console.log(`\nApp: ${BASE}   API: ${API}   Hoje (Brasília): ${TODAY}\n`)

  // ---------------------------------------------------------------- Início e diário
  console.log('Início e diário')
  await step('início vazio mostra saudação, resumo e atalhos', async () => {
    await page.goto(`${BASE}/`)
    await page.getByRole('heading', { level: 1, name: /Bom dia|Boa tarde|Boa noite/ }).waitFor()
    await page.getByRole('heading', { level: 2, name: /^[a-zç]+ de \d{4}$/i }).waitFor()
    await page.getByText('Nada registrado hoje ainda.').waitFor()
    await page.getByRole('link', { name: 'Adicionar refeição' }).first().waitFor()
    await page.getByRole('link', { name: 'Registrar experiência alimentar' }).first().waitFor()
    await page.getByText('Nenhuma atividade ainda').waitFor()
    assert.equal(await page.getByText('Não registrado', { exact: true }).count(), 6)
    assert.equal(await pageOverflows(page), false, 'overflow horizontal no início (1280)')
    await shot(page, 'desktop-01-inicio-vazio')
  })

  await step('/diario abre o dia de hoje com as seis refeições "Não registrado"', async () => {
    await page.goto(`${BASE}/diario`)
    await page.waitForURL(`**/diario/${TODAY}`)
    for (const type of ['breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'supper']) {
      await slot(page, type).getByText('Não registrado').waitFor()
    }
    await shot(page, 'desktop-02-diario-vazio')
  })

  await step('adicionar alimento novo pede confirmação e salva na refeição', async () => {
    const dlg = await openAddFood(page, slot(page, 'breakfast').getByRole('button', { name: 'Adicionar alimento' }), 'Pão integral', {
      quantity: '2 fatias',
      time: '08:10',
    })
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await promptBox(page).getByText('é um alimento novo').waitFor()
    await shot(page, 'desktop-03-confirmar-alimento-novo')
    await promptBox(page).getByRole('button', { name: 'Cadastrar e adicionar' }).click()
    await dlg.waitFor({ state: 'hidden' })
    await toastText(page, 'adicionado ao café da manhã').waitFor()
    await slot(page, 'breakfast').getByText('Pão integral').waitFor()
    await slot(page, 'breakfast').getByText('2 fatias').waitFor()
  })

  await step('vários alimentos na mesma refeição', async () => {
    const trigger = slot(page, 'breakfast').getByRole('article').getByRole('button', { name: 'Adicionar alimento' })
    const dlg = await openAddFood(page, trigger, 'Ovo mexido', { quantity: '2 ovos' })
    await submitAddFood(page, dlg, /Cadastrar e adicionar/)
    await slot(page, 'breakfast').getByText('Ovo mexido').waitFor()
    assert.equal(await slot(page, 'breakfast').getByRole('article').count(), 1, 'deveria ser uma refeição só')
  })

  await step('mais de uma ocorrência da mesma refeição no dia', async () => {
    const trigger = slot(page, 'breakfast').getByRole('button', { name: 'Adicionar outra ocorrência de café da manhã' })
    const dlg = await openAddFood(page, trigger, 'Café preto', { time: '09:30' })
    await submitAddFood(page, dlg, /Cadastrar e adicionar/)
    await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby="slot-breakfast"] article').length === 2)
  })

  await step('nome igual a um alimento existente pergunta se é o mesmo', async () => {
    const dlg = await openAddFood(page, slot(page, 'lunch').getByRole('button', { name: 'Adicionar alimento' }), 'pao integral')
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await promptBox(page).getByText('É o mesmo alimento?').waitFor()
    await promptBox(page).getByText('Pão integral').first().waitFor()
    await shot(page, 'desktop-04-mesmo-alimento')
    await promptBox(page).getByRole('button', { name: /Sim, usar/ }).click()
    await dlg.waitFor({ state: 'hidden' })
    await slot(page, 'lunch').getByText('Pão integral').waitFor()
    assert.equal(await page.locator('section[aria-labelledby="slot-lunch"] >> text=pao integral').count(), 0)
  })

  await step('nome parecido oferece usar o existente ou cadastrar novo', async () => {
    const trigger = slot(page, 'lunch').getByRole('article').getByRole('button', { name: 'Adicionar alimento' })
    const dlg = await openAddFood(page, trigger, 'Pão')
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await promptBox(page).getByText('Parecido com').waitFor()
    await promptBox(page).getByRole('button', { name: /Voltar/ }).click()
    await promptBox(page).waitFor({ state: 'hidden' })
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await promptBox(page).getByRole('button', { name: /Não, cadastrar “Pão” como novo/ }).click()
    await dlg.waitFor({ state: 'hidden' })
    await slot(page, 'lunch').getByText('Pão', { exact: true }).waitFor()
  })

  await step('validação: nome vazio, erro só depois do blur e some ao digitar', async () => {
    const dlg = await openAddFood(page, slot(page, 'dinner').getByRole('button', { name: 'Adicionar alimento' }), 'x')
    assert.equal(await dlg.getByLabel('Horário do consumo').inputValue(), '19:30', 'horário padrão do jantar')
    const field = dlg.getByRole('combobox', { name: 'Alimento', exact: true })
    assert.equal(await dlg.getByRole('alert').count(), 0, 'erro apareceu enquanto digitava')
    await field.fill('')
    await field.blur()
    await dlg.getByRole('alert').first().waitFor()
    assert.equal(await field.getAttribute('aria-invalid'), 'true')
    await field.pressSequentially('a')
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] [role="alert"]').length === 0)
    await field.fill('')
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await dlg.getByRole('alert').first().waitFor()
    assert.equal(await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).isDisabled(), false, 'botão de envio não pode ficar desabilitado')
    await shot(page, 'desktop-05-validacao')
    await page.keyboard.press('Escape')
    await dlg.waitFor({ state: 'hidden' })
  })

  await step('Esc fecha o painel e devolve o foco ao botão que abriu', async () => {
    const trigger = slot(page, 'supper').getByRole('button', { name: 'Adicionar alimento' })
    await trigger.click()
    await dialog(page).waitFor()
    await page.keyboard.press('Escape')
    await dialog(page).waitFor({ state: 'hidden' })
    const label = await page.evaluate(() => document.activeElement && document.activeElement.textContent)
    assert.match(label || '', /Adicionar alimento/)
  })

  await step('painel com texto digitado pede confirmação antes de descartar', async () => {
    const trigger = slot(page, 'supper').getByRole('button', { name: 'Adicionar alimento' })
    await trigger.click()
    const dlg = dialog(page)
    await dlg.getByRole('combobox', { name: 'Alimento', exact: true }).fill('Chá de camomila')
    await dlg.getByLabel('Quantidade').fill('1 xícara')
    await dlg.getByRole('button', { name: 'Fechar painel' }).click()
    await dlg.getByText('Descartar as alterações deste formulário?').waitFor()
    await dlg.getByRole('button', { name: 'Voltar ao formulário' }).or(dlg.getByRole('button', { name: /Continuar/ })).first().click()
    await dlg.getByLabel('Quantidade').waitFor()
    assert.equal(await dlg.getByLabel('Quantidade').inputValue(), '1 xícara')
    await dlg.getByRole('button', { name: 'Fechar painel' }).click()
    await dlg.getByRole('button', { name: /Descartar/ }).last().click()
    await dlg.waitFor({ state: 'hidden' })
  })

  await step('anotar sentimentos (emoji + texto) no almoço', async () => {
    await slot(page, 'lunch').getByRole('button', { name: /Editar almoço/ }).click()
    const dlg = dialog(page)
    await dlg.getByRole('button', { name: /Tranquilo/ }).click()
    assert.equal(await dlg.getByRole('button', { name: /Tranquilo/ }).getAttribute('aria-pressed'), 'true')
    await dlg.getByRole('button', { name: /Curioso/ }).click()
    await dlg.getByLabel('Como me senti, em palavras').fill('Leve e sem pressa')
    await dlg.getByLabel('O que pensei?').fill('Estava com vontade de pão')
    await dlg.getByLabel('Horário').fill('12:40')
    await shot(page, 'desktop-06-painel-refeicao')
    await dlg.getByRole('button', { name: 'Salvar refeição' }).click()
    await dlg.waitFor({ state: 'hidden' })
    await toastText(page, 'Almoço atualizado.').waitFor()
    await slot(page, 'lunch').getByText('Leve e sem pressa').waitFor()
    await slot(page, 'lunch').getByText('Tranquilo').first().waitFor()
  })

  await step('refeição sem alimento: só sentimento já salva; salvar vazio avisa', async () => {
    await slot(page, 'dinner').getByRole('button', { name: 'Anotar como foi' }).click()
    const dlg = dialog(page)
    await dlg.getByRole('button', { name: 'Salvar refeição' }).click()
    await dlg.getByRole('alert').first().waitFor()
    await dlg.getByRole('button', { name: /Feliz/ }).click()
    await dlg.getByRole('button', { name: 'Salvar refeição' }).click()
    await dlg.waitFor({ state: 'hidden' })
    await toastText(page, 'Jantar registrado.').waitFor()
    await slot(page, 'dinner').getByText('Feliz').first().waitFor()
  })

  await step('editar quantidade de um alimento da refeição', async () => {
    await slot(page, 'breakfast').getByRole('button', { name: 'Editar Pão integral' }).click()
    const dlg = dialog(page)
    await dlg.getByLabel('Quantidade').fill('3 fatias')
    await dlg.getByRole('button', { name: 'Salvar alterações' }).click()
    await dlg.waitFor({ state: 'hidden' })
    await toastText(page, 'Alimento atualizado.').waitFor()
    await slot(page, 'breakfast').getByText('3 fatias').waitFor()
  })

  await step('remover alimento: confirmação nomeia o alimento, Cancelar tem o foco, Esc cancela', async () => {
    await slot(page, 'breakfast').getByRole('button', { name: 'Excluir Ovo mexido desta refeição' }).click()
    const box = confirmBox(page)
    await box.getByRole('heading', { name: /Ovo mexido/ }).waitFor()
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.textContent)
    assert.equal(focused, 'Cancelar')
    await page.keyboard.press('Escape')
    await box.waitFor({ state: 'hidden' })
    await slot(page, 'breakfast').getByText('Ovo mexido').waitFor()
    await slot(page, 'breakfast').getByRole('button', { name: 'Excluir Ovo mexido desta refeição' }).click()
    await box.getByRole('button', { name: 'Excluir alimento' }).click()
    await box.waitFor({ state: 'hidden' })
    await toastText(page, 'Alimento removido').waitFor()
    assert.equal(await slot(page, 'breakfast').getByText('Ovo mexido').count(), 0)
  })

  await step('excluir refeição inteira com confirmação', async () => {
    await slot(page, 'breakfast').getByRole('button', { name: /Excluir café da manhã/ }).last().click()
    await confirmBox(page).getByRole('button', { name: 'Excluir refeição' }).click()
    await toastText(page, 'Refeição excluída.').waitFor()
    await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby="slot-breakfast"] article').length === 1)
  })

  await step('observações gerais do dia persistem após recarregar', async () => {
    const section = page.locator('section[aria-label="Observações do dia"]')
    await section.getByLabel('Observações do dia').fill('Dia corrido, mas comi com calma.')
    await section.getByRole('button').first().click()
    await toastText(page, 'Observações do dia salvas.').waitFor()
    await page.reload()
    await page.locator('section[aria-label="Observações do dia"]').getByLabel('Observações do dia').waitFor()
    assert.equal(await page.locator('section[aria-label="Observações do dia"]').getByLabel('Observações do dia').inputValue(), 'Dia corrido, mas comi com calma.')
    await shot(page, 'desktop-07-diario-preenchido')
  })

  await step('navegar entre dias e voltar para hoje', async () => {
    await page.getByRole('button', { name: 'Dia anterior' }).click()
    await page.waitForURL(`**/diario/${YESTERDAY}`)
    await page.waitForFunction((d) => document.querySelector('input[type="date"]')?.value === d, YESTERDAY)
    await slot(page, 'breakfast').getByText('Não registrado').first().waitFor()
    assert.equal(await page.locator('section[aria-labelledby^="slot-"] article').count(), 0, 'o dia anterior deveria estar vazio')
    await page.getByRole('button', { name: 'Ir para hoje' }).click()
    await page.waitForURL(`**/diario/${TODAY}`)
    await page.getByRole('button', { name: 'Próximo dia' }).click()
    await page.waitForURL(`**/diario/${isoAdd(TODAY, 1)}`)
    await page.goto(`${BASE}/diario/${TODAY}`)
  })

  await step('data inválida na URL volta para hoje', async () => {
    await page.goto(`${BASE}/diario/2026-13-45`)
    await page.waitForURL(`**/diario/${TODAY}`)
  })

  // ---------------------------------------------------------------- Experiências
  console.log('Experiências alimentares')
  await step('experiência "Alimento novo" com sentimentos', async () => {
    await page.goto(`${BASE}/experiencias`)
    await page.getByRole('heading', { level: 1, name: 'Registro de experiência alimentar' }).waitFor()
    await page.getByText('Nenhuma experiência registrada').waitFor()
    // Validação: enviar vazio mostra o erro, sem desabilitar o botão.
    await page.getByRole('button', { name: 'Salvar experiência' }).click()
    await page.getByRole('alert').first().waitFor()
    const food = page.getByRole('combobox', { name: 'Alimento', exact: true })
    await food.fill('Kiwi')
    await page.getByRole('button', { name: /Curioso/ }).click()
    await page.getByLabel('Como me senti?').fill('Achei ácido, mas gostei')
    await page.getByLabel('O que pensei?').fill('Parecia estranho por fora')
    await page.getByLabel('Como foi depois?').fill('Nada de diferente')
    await shot(page, 'desktop-08-experiencia-form')
    await page.getByRole('button', { name: 'Salvar experiência' }).click()
    await answerFoodPrompts(page, page, /Cadastrar e salvar/)
    await toastText(page, 'Experiência salva').waitFor()
    await page.getByRole('article', { name: 'Experiência com Kiwi' }).waitFor()
  })

  await step('experiência "Substituição alimentar" mostra o alimento trocado', async () => {
    await page.getByRole('radio', { name: 'Substituição alimentar' }).check()
    await page.getByRole('combobox', { name: 'Alimento', exact: true }).fill('Granola')
    const replaced = page.getByRole('combobox', { name: /No lugar de qual alimento/ })
    await replaced.fill('Pão')
    await page.getByRole('option', { name: 'Pão integral' }).click()
    await page.getByLabel('Como me senti?').fill('Mais crocante')
    await page.getByRole('button', { name: 'Salvar experiência' }).click()
    await answerFoodPrompts(page, page, /Cadastrar e salvar|Cadastrar e continuar/)
    await toastText(page, 'Experiência salva').waitFor()
    const card = page.getByRole('article', { name: 'Experiência com Granola' })
    await card.waitFor()
    await card.getByText('No lugar de').waitFor()
    await card.getByText('Pão integral').waitFor()
  })

  await step('experiência pelo painel do diário: dois passos sem sair da refeição', async () => {
    await page.goto(`${BASE}/diario/${TODAY}`)
    const dlg = await openAddFood(page, slot(page, 'afternoon_snack').getByRole('button', { name: 'Adicionar alimento' }), 'Abacate')
    await dlg.getByRole('button', { name: /Registrar nova experiência alimentar/ }).click()
    await dlg.getByRole('heading', { name: 'Registrar experiência alimentar' }).waitFor()
    assert.equal(await dlg.getByRole('combobox', { name: 'Alimento', exact: true }).inputValue(), 'Abacate')
    await dlg.getByRole('button', { name: /Neutro/ }).click()
    await dlg.getByRole('button', { name: 'Salvar experiência' }).click()
    await answerFoodPrompts(page, dlg, /Cadastrar e salvar/)
    await toastText(page, 'Agora é só adicionar o alimento à refeição.').waitFor()
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await dlg.waitFor({ state: 'hidden' })
    await slot(page, 'afternoon_snack').getByText('Abacate').waitFor()
    await page.getByRole('heading', { name: 'Experiências alimentares do dia' }).waitFor()
    assert.ok((await page.getByText('Alimento novo').count()) >= 1)
  })

  await step('editar experiência mantém os dados e volta para a lista', async () => {
    await page.goto(`${BASE}/historico/linha-do-tempo`)
    await page.getByRole('link', { name: 'Editar experiência com Kiwi' }).click()
    await page.getByRole('heading', { level: 1, name: 'Editar experiência alimentar' }).waitFor()
    assert.equal(await page.getByRole('combobox', { name: 'Alimento', exact: true }).inputValue(), 'Kiwi')
    assert.equal(await page.getByLabel('Como me senti?').inputValue(), 'Achei ácido, mas gostei')
    await page.getByLabel('Observações').fill('Comprar de novo')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await toastText(page, 'Experiência atualizada.').waitFor()
    await page.waitForURL('**/experiencias')
  })

  // ---------------------------------------------------------------- Alimentos
  console.log('Alimentos registrados')
  await step('lista de alimentos com números e ordenação', async () => {
    await page.goto(`${BASE}/alimentos`)
    await page.getByRole('heading', { level: 1, name: 'Alimentos registrados' }).waitFor()
    const row = page.getByRole('row', { name: /Pão integral/ })
    await row.waitFor()
    const cells = await row.getByRole('cell').allTextContents()
    assert.ok(cells.join('|').includes('2'), `contagem de refeições do Pão integral: ${cells.join('|')}`)
    await page.getByRole('row', { name: /Café preto/ }).getByText('Sem registro').waitFor()
    await page.getByLabel('Ordenar por').selectOption('most')
    const first = await page.getByRole('row').nth(1).textContent()
    assert.match(first || '', /Pão integral/)
    await page.getByLabel('Ordenar por').selectOption('name')
    await shot(page, 'desktop-09-alimentos')
    assert.equal(await pageOverflows(page), false)
  })

  await step('cadastrar alimento direto, buscar e limpar a busca', async () => {
    const field = page.getByRole('combobox', { name: 'Cadastrar alimento' })
    await field.fill('Manga')
    await field.press('Enter')
    await answerFoodPrompts(page, page, /Cadastrar$/)
    await toastText(page, 'cadastrado em Alimentos registrados').waitFor()
    await page.getByRole('row', { name: /Manga/ }).waitFor()
    await page.getByLabel('Pesquisar alimentos').fill('mang')
    await page.waitForFunction(() => document.querySelectorAll('[role="row"]').length === 2)
    await page.getByLabel('Pesquisar alimentos').fill('zzzz')
    await page.getByText(/Nenhum alimento corresponde/).waitFor()
    await page.getByRole('button', { name: 'Limpar busca' }).click()
    await page.getByRole('row', { name: /Kiwi/ }).waitFor()
  })

  await step('renomear no lugar não desloca a lista; Esc cancela; nome repetido é recusado', async () => {
    const rows = page.getByRole('row')
    const nextTop = async () => (await page.getByRole('row', { name: /Pão integral/ }).boundingBox()).y
    const before = await nextTop()
    const mangaBox = await page.getByRole('row', { name: /Manga/ }).boundingBox()
    await page.getByRole('button', { name: 'Renomear Manga' }).click()
    const input = page.getByLabel('Novo nome para Manga')
    await input.waitFor()
    const editBox = await page.getByRole('row', { name: /Manga/ }).boundingBox()
    assert.equal(Math.round(editBox.height), Math.round(mangaBox.height), 'altura da linha mudou ao editar')
    assert.equal(Math.round(await nextTop()), Math.round(before), 'a lista se deslocou ao editar')
    await input.fill('Manga rosa')
    await page.keyboard.press('Escape')
    await page.getByRole('row', { name: /Manga/ }).getByText('Manga', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Renomear Manga' }).click()
    await page.getByLabel('Novo nome para Manga').fill('kiwi')
    ignoreConsole = true // o navegador registra o 409 esperado como erro de rede
    await page.keyboard.press('Enter')
    await page.getByRole('alert').filter({ hasText: /Já existe|já existe/ }).first().waitFor()
    ignoreConsole = false
    await page.getByLabel('Novo nome para Manga').fill('Manga rosa')
    await page.keyboard.press('Enter')
    await toastText(page, 'Alimento renomeado.').waitFor()
    await page.getByRole('row', { name: /Manga rosa/ }).waitFor()
    assert.ok((await rows.count()) > 3)
  })

  await step('excluir alimento com experiência é bloqueado; sem uso, pede confirmação', async () => {
    await page.getByRole('button', { name: 'Excluir Kiwi' }).click()
    const box = confirmBox(page)
    await box.getByRole('heading', { name: /Não é possível excluir “Kiwi”/ }).waitFor()
    await box.getByRole('button', { name: 'Entendi' }).click()
    await box.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Excluir Manga rosa' }).click()
    await box.getByRole('heading', { name: 'Excluir “Manga rosa”?' }).waitFor()
    await box.getByRole('button', { name: 'Excluir alimento' }).click()
    await toastText(page, 'Alimento excluído.').waitFor()
    assert.equal(await page.getByRole('row', { name: /Manga rosa/ }).count(), 0)
  })

  await step('detalhe do alimento lista refeições e experiências', async () => {
    await page.getByRole('link', { name: /Pão integral/ }).first().click()
    await page.getByRole('heading', { level: 1, name: 'Pão integral' }).waitFor()
    await page.getByRole('heading', { name: 'Refeições em que apareceu' }).waitFor()
    await page.getByRole('heading', { name: 'Experiências relacionadas' }).waitFor()
    await page.getByRole('link', { name: 'Alimentos registrados' }).first().waitFor()
    await shot(page, 'desktop-10-alimento-detalhe')
    await page.goto(`${BASE}/alimentos/00000000-0000-0000-0000-000000000000`)
    await page.getByText('Alimento não encontrado').waitFor()
  })

  // ---------------------------------------------------------------- Histórico
  console.log('Histórico')
  await step('calendário marca os dias com registro e mostra o dia em leitura', async () => {
    await page.goto(`${BASE}/historico`)
    await page.getByRole('heading', { level: 1, name: 'Histórico' }).waitFor()
    const todayButton = page.getByRole('button', { name: /refeições.*experiência|refeição/ }).first()
    await todayButton.waitFor()
    await todayButton.click()
    await page.getByRole('heading', { name: 'Observações do dia' }).waitFor()
    await page.getByText('Dia corrido, mas comi com calma.').waitFor()
    await page.getByText('Pão integral').first().waitFor()
    await page.getByRole('link', { name: 'Editar no diário' }).waitFor()
    await shot(page, 'desktop-11-historico-calendario')
  })

  await step('dia sem registro mostra "Não registrado" e atalho para adicionar', async () => {
    await page.getByRole('button', { name: new RegExp(`^${new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${YESTERDAY}T12:00:00Z`))}`, 'i') }).first().click()
    await page.getByText('Não registrado').first().waitFor()
    await page.getByRole('link', { name: 'Adicionar refeição' }).waitFor()
  })

  await step('pesquisa por alimento ignora acento e maiúsculas, com "Limpar filtros"', async () => {
    await page.getByLabel('Pesquisar por alimento').fill('PAO')
    await page.getByText(/dia encontrado/).waitFor()
    await page.getByRole('link', { name: /Café da manhã/ }).first().waitFor()
    await page.getByLabel('Pesquisar por alimento').fill('zzzzz')
    await page.getByText('Nenhum dia encontrado').waitFor()
    await page.getByRole('button', { name: 'Limpar filtros' }).last().click()
    await page.getByRole('heading', { name: 'Observações do dia' }).waitFor()
    assert.equal(await page.getByLabel('Pesquisar por alimento').inputValue(), '')
  })

  await step('período invertido mostra erro e não pesquisa', async () => {
    await page.getByLabel('De', { exact: true }).fill('2026-12-01')
    await page.getByLabel('Até', { exact: true }).fill('2026-11-01')
    await page.getByText('A data inicial precisa ser anterior à data final.').first().waitFor()
    await page.getByRole('button', { name: 'Limpar filtros' }).first().click()
  })

  await step('linha do tempo agrupa por mês e filtra por tipo', async () => {
    await page.getByRole('link', { name: 'Linha do tempo' }).click()
    await page.waitForURL('**/historico/linha-do-tempo')
    await page.getByRole('form', { name: 'Filtrar experiências' }).waitFor()
    await page.getByRole('heading', { name: /novembro de 2026/i }).waitFor()
    await page.getByRole('article', { name: 'Experiência com Kiwi' }).waitFor()
    await page.getByLabel('Tipo').selectOption('substitution')
    await page.getByRole('article', { name: 'Experiência com Granola' }).waitFor()
    assert.equal(await page.getByRole('article', { name: 'Experiência com Kiwi' }).count(), 0)
    await page.getByLabel('Alimento').selectOption({ label: 'Kiwi' })
    await page.getByText('Nenhuma experiência encontrada').waitFor()
    await page.getByRole('button', { name: 'Limpar filtros' }).last().click()
    await page.getByRole('article', { name: 'Experiência com Kiwi' }).waitFor()
    await shot(page, 'desktop-12-linha-do-tempo')
  })

  await step('excluir experiência: confirmação nomeia alimento e data', async () => {
    await page.getByRole('button', { name: 'Excluir experiência com Abacate' }).click()
    const box = confirmBox(page)
    await box.getByRole('heading', { name: /Excluir a experiência com “Abacate”/ }).waitFor()
    await box.getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('article', { name: 'Experiência com Abacate' }).waitFor()
    await page.getByRole('button', { name: 'Excluir experiência com Abacate' }).click()
    await box.getByRole('button', { name: 'Excluir experiência' }).click()
    await toastText(page, 'Experiência excluída.').waitFor()
    assert.equal(await page.getByRole('article', { name: 'Experiência com Abacate' }).count(), 0)
  })

  await step('relatório informativo: totais, gráficos e nota sem juízo de valor', async () => {
    await page.getByRole('link', { name: 'Relatório' }).click()
    await page.waitForURL('**/historico/acompanhamento')
    await page.getByRole('group', { name: 'Totais do período' }).or(page.getByLabel('Totais do período')).first().waitFor()
    await page.getByText('Refeições registradas').waitFor()
    await page.getByRole('heading', { name: 'Alimentos mais registrados' }).waitFor()
    await page.getByRole('heading', { name: 'Experiências por mês' }).waitFor()
    await page.getByText(/não avalia a alimentação/).waitFor()
    const text = (await page.locator('main').innerText()).toLowerCase()
    for (const banned of ['caloria', 'meta ', 'saudável', 'peso', 'engord', 'dieta', 'proibido']) {
      assert.ok(!text.includes(banned), `o relatório não deveria falar em "${banned}"`)
    }
    await page.getByRole('button', { name: 'Este mês' }).click()
    await page.getByRole('button', { name: 'Este mês' }).and(page.locator('[aria-pressed="true"]')).waitFor()
    await page.getByLabel('De', { exact: true }).fill('2020-01-01')
    await page.getByLabel('Até', { exact: true }).fill('2020-01-31')
    await page.getByText('Nada registrado neste período').waitFor()
    await page.getByRole('button', { name: 'Limpar período' }).click()
    await page.getByText('Refeições registradas').waitFor()
    await shot(page, 'desktop-13-relatorio')
    assert.equal(await pageOverflows(page), false)
  })

  // ---------------------------------------------------------------- Configurações e rotas
  console.log('Configurações, rotas e erros')
  await step('exportar dados baixa um JSON com tudo', async () => {
    await page.goto(`${BASE}/configuracoes`)
    await page.getByRole('heading', { level: 1, name: 'Configurações' }).waitFor()
    await page.getByText(/não tem login/).waitFor()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar cópia dos dados' }).click()])
    const file = path.join(SHOTS, 'export.json')
    await download.saveAs(file)
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.ok(Array.isArray(data.foods) && data.foods.length >= 5, 'foods')
    assert.ok(Array.isArray(data.meals) && data.meals.length >= 3, 'meals')
    assert.ok(Array.isArray(data.food_experiences) && data.food_experiences.length >= 2, 'food_experiences')
    assert.match(download.suggestedFilename(), /^diario-alimentar-\d{4}-\d{2}-\d{2}\.json$/)
    await shot(page, 'desktop-14-configuracoes')
  })

  await step('rota inexistente mostra "Página não encontrada"', async () => {
    await page.goto(`${BASE}/nao-existe`)
    await page.getByRole('heading', { name: 'Página não encontrada' }).waitFor()
    await page.getByRole('link', { name: 'Ir para o início' }).click()
    await page.waitForURL(`${BASE}/`)
  })

  await step('falha de rede: tela de erro com "Tentar de novo"', async () => {
    ignoreConsole = true
    await post('/__mode', { mode: 'down' })
    await page.goto(`${BASE}/alimentos`)
    await page.getByRole('alert').filter({ hasText: 'Não foi possível carregar' }).waitFor({ timeout: 20000 })
    await shot(page, 'desktop-15-erro-de-rede')
    await post('/__mode', { mode: 'ok' })
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await page.getByRole('row', { name: /Kiwi/ }).waitFor()
    ignoreConsole = false
  })

  await step('chave inválida: o painel diz a causa e mostra os detalhes técnicos', async () => {
    ignoreConsole = true
    await post('/__mode', { mode: 'badkey' })
    await page.goto(`${BASE}/alimentos`)
    const panel = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar' })
    await panel.waitFor({ timeout: 20000 })
    await panel.getByText(/não aceitou a chave/).waitFor()
    await panel.getByText('Detalhes técnicos').click()
    await panel.getByText(/HTTP 401/).waitFor()
    await panel.getByText(/Invalid API key/).waitFor()
    await shot(page, 'desktop-15b-erro-de-chave')
    await post('/__mode', { mode: 'ok' })
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await page.getByRole('row', { name: /Kiwi/ }).waitFor()
    ignoreConsole = false
  })

  await step('Configurações > Testar conexão: tudo ok, e causa clara quando a chave é inválida', async () => {
    ignoreConsole = true
    await page.goto(`${BASE}/configuracoes`)
    await page.getByRole('heading', { level: 1, name: 'Configurações' }).waitFor()
    await page.getByRole('button', { name: 'Testar conexão' }).click()
    const result = page.getByRole('list', { name: 'Resultado do teste de conexão' })
    await result.getByText('Endereço, chave e tabelas: ok').waitFor()
    await result.getByText('Funções do app: ok').waitFor()
    await post('/__mode', { mode: 'badkey' })
    await page.getByRole('button', { name: 'Testar conexão' }).click()
    await result.getByText('Endereço, chave e tabelas: falhou').waitFor()
    await result.getByText(/não aceitou a chave/).first().waitFor()
    await result.getByText(/HTTP 401/).first().waitFor()
    await shot(page, 'desktop-15c-testar-conexao')
    await post('/__mode', { mode: 'badurl' })
    await page.getByRole('button', { name: 'Testar conexão' }).click()
    await result.getByText(/endereço do Supabase parece errado/).first().waitFor()
    await post('/__mode', { mode: 'ok' })
    ignoreConsole = false
  })

  await step('falha ao salvar: aviso de erro e o formulário mantém o que foi digitado', async () => {
    ignoreConsole = true
    await page.goto(`${BASE}/diario/${TODAY}`)
    await slot(page, 'supper').getByText('Não registrado').waitFor()
    const dlg = await openAddFood(page, slot(page, 'supper').getByRole('button', { name: 'Adicionar alimento' }), 'Maçã', { quantity: '1 unidade' })
    await post('/__mode', { mode: 'down' })
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await answerFoodPrompts(page, dlg, /Cadastrar e adicionar/)
    await page.getByRole('alert').filter({ hasText: /./ }).first().waitFor({ timeout: 15000 })
    assert.equal(await dlg.getByLabel('Quantidade').inputValue(), '1 unidade', 'dados digitados foram perdidos')
    await shot(page, 'desktop-16-erro-ao-salvar')
    await post('/__mode', { mode: 'ok' })
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await answerFoodPrompts(page, dlg, /Cadastrar e adicionar/)
    await dlg.waitFor({ state: 'hidden' })
    await slot(page, 'supper').getByText('Maçã').waitFor()
    ignoreConsole = false
  })

  await step('carregamento lento mostra esqueleto depois de 250 ms', async () => {
    await post('/__mode', { mode: 'slow', delayMs: 1800 })
    await page.goto(`${BASE}/alimentos`)
    await page.waitForTimeout(600)
    assert.ok((await page.locator('[aria-hidden="true"].animate-pulse, .motion-safe\\:animate-pulse').count()) > 0, 'sem esqueleto de carregamento')
    await shot(page, 'desktop-17-carregando')
    await post('/__mode', { mode: 'ok' })
    await page.getByRole('row', { name: /Kiwi/ }).waitFor({ timeout: 15000 })
  })

  await step('fuso horário: "hoje" é o dia de Brasília mesmo com o aparelho em Tóquio', async () => {
    const tokyo = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'Asia/Tokyo' })
    const p = await tokyo.newPage()
    await p.goto(`${BASE}/diario`)
    await p.waitForURL(`**/diario/${TODAY}`)
    await tokyo.close()
  })

  // ---------------------------------------------------------------- Responsivo
  console.log('Responsivo')
  const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' })
  const mp = await mobile.newPage()
  mp.setDefaultTimeout(8000)
  mp.on('pageerror', (e) => consoleProblems.push(`mobile pageerror: ${e.message}`))
  currentPage = mp

  const routes = ['/', `/diario/${TODAY}`, '/experiencias', '/historico', '/historico/linha-do-tempo', '/historico/acompanhamento', '/alimentos', '/configuracoes', '/nao-existe']
  for (const route of routes) {
    await step(`375px sem rolagem horizontal: ${route}`, async () => {
      await mp.goto(`${BASE}${route}`)
      await mp.waitForLoadState('networkidle')
      await mp.waitForTimeout(300)
      assert.equal(await pageOverflows(mp), false, `overflow em ${route}`)
      await shot(mp, `mobile-${route.replace(/[^a-z0-9]+/gi, '_') || 'inicio'}`)
    })
  }

  await step('375px: menu abre, leva à página e fecha', async () => {
    await mp.goto(`${BASE}/`)
    await mp.getByRole('button', { name: 'Abrir menu' }).click()
    const menu = mp.getByRole('dialog', { name: 'Menu' })
    await menu.waitFor()
    await shot(mp, 'mobile-menu')
    await menu.getByRole('link', { name: 'Alimentos registrados' }).click()
    await mp.waitForURL('**/alimentos')
    await menu.waitFor({ state: 'hidden' })
  })

  await step('375px: painel de alimento ocupa a tela e permite salvar', async () => {
    await mp.goto(`${BASE}/diario/${TODAY}`)
    await mp.locator('section[aria-labelledby="slot-morning_snack"]').getByRole('button', { name: 'Adicionar alimento' }).click()
    const dlg = mp.getByRole('dialog')
    await dlg.waitFor()
    const box = await dlg.boundingBox()
    assert.ok(box.width >= 340, `painel estreito: ${box.width}`)
    await dlg.getByRole('combobox', { name: 'Alimento', exact: true }).fill('Kiwi')
    await mp.getByRole('option', { name: 'Kiwi' }).click()
    await shot(mp, 'mobile-painel')
    await dlg.getByRole('button', { name: 'Adicionar alimento', exact: true }).click()
    await dlg.waitFor({ state: 'hidden' })
    await mp.locator('section[aria-labelledby="slot-morning_snack"]').getByText('Kiwi').waitFor()
    assert.equal(await pageOverflows(mp), false)
  })

  await step('375px: alvos de toque com pelo menos 44px nos botões do diário', async () => {
    await mp.goto(`${BASE}/diario/${TODAY}`)
    const small = await mp.evaluate(() => {
      const bad = []
      for (const el of document.querySelectorAll('main button, main a, header button')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (r.height < 43.5 || r.width < 43.5) bad.push(`${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)} ${Math.round(r.width)}x${Math.round(r.height)}`)
      }
      return bad
    })
    assert.deepEqual(small, [], `alvos pequenos: ${small.join('; ')}`)
  })

  await mobile.close()

  // ---------------------------------------------------------------- Final
  console.log('Final')
  await step('nenhum erro inesperado no console durante o teste', async () => {
    assert.deepEqual(consoleProblems, [], consoleProblems.join('\n'))
  })

  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length} de ${results.length} passos passaram.`)
  console.log(`Capturas de tela em ${SHOTS}`)
  if (failed.length) {
    console.log('\nFalhas:')
    for (const f of failed) console.log(`- ${f.name}\n    ${f.message}`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
