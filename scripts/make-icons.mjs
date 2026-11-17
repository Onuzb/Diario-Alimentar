#!/usr/bin/env node
/**
 * Gera os ícones do app (PNG) a partir do desenho da folha de public/favicon.svg.
 * Uso: npm run icons   (precisa do Playwright com Chromium; só roda quando o desenho mudar)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)('playwright')

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

const GREEN = '#4B6350'
const CREAM = '#F5F1E6'
const SAGE = '#CFDCC8'

/** A folha, desenhada numa área 64x64. `scale` encolhe o desenho ao redor do centro (zona segura dos ícones adaptáveis). */
const leaf = (stem, big, small, scale = 1) => `
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">
    <path d="M32 50V30" stroke="${stem}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M32 32c0-9 6-15 15-15 0 9-6 15-15 15Z" fill="${big}"/>
    <path d="M32 40c0-7-5-12-12-12 0 7 5 12 12 12Z" fill="${small}"/>
  </g>`

const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${inner}</svg>`

const icons = [
  // Ícone comum: cantos arredondados, como o favicon.
  { file: 'icon-192.png', size: 192, svg: svg(`<rect width="64" height="64" rx="16" fill="${GREEN}"/>${leaf(CREAM, CREAM, SAGE)}`) },
  { file: 'icon-512.png', size: 512, svg: svg(`<rect width="64" height="64" rx="16" fill="${GREEN}"/>${leaf(CREAM, CREAM, SAGE)}`) },
  // Ícone adaptável (Android recorta): fundo até a borda e desenho dentro dos 80% centrais.
  { file: 'icon-maskable-512.png', size: 512, svg: svg(`<rect width="64" height="64" fill="${GREEN}"/>${leaf(CREAM, CREAM, SAGE, 0.78)}`) },
  // iOS arredonda sozinho: quadrado inteiro.
  { file: 'apple-touch-icon.png', size: 180, svg: svg(`<rect width="64" height="64" fill="${GREEN}"/>${leaf(CREAM, CREAM, SAGE, 0.86)}`) },
  // Selo da barra de status do Android: só silhueta branca sobre transparente.
  { file: 'badge-96.png', size: 96, transparent: true, svg: svg(leaf('#fff', '#fff', '#fff', 1.1)) },
]

const browser = await chromium.launch()
try {
  for (const icon of icons) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${icon.size}px;height:${icon.size}px}</style>${icon.svg}`,
    )
    const png = await page.screenshot({ omitBackground: Boolean(icon.transparent), clip: { x: 0, y: 0, width: icon.size, height: icon.size } })
    writeFileSync(join(out, icon.file), png)
    console.log(`  ${icon.file} (${icon.size}x${icon.size})`)
    await page.close()
  }
} finally {
  await browser.close()
}
