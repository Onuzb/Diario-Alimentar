#!/usr/bin/env node
/**
 * Gera o par de chaves VAPID que identifica o seu servidor nas notificações.
 *
 *   npm run vapid
 *
 * - A chave PÚBLICA vai no site (variável VITE_VAPID_PUBLIC_KEY) e também no
 *   segredo VAPID_PUBLIC_KEY da Edge Function.
 * - A chave PRIVADA vai só no segredo VAPID_PRIVATE_KEY da Edge Function.
 *   Nunca a coloque no site, no .env do site nem no GitHub.
 *
 * Gere o par uma vez e guarde. Se trocar o par, todos os aparelhos precisam
 * ativar os lembretes de novo.
 */
import { generateKeyPairSync } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const pub = publicKey.export({ format: 'jwk' })
  const priv = privateKey.export({ format: 'jwk' })
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')])
  return { publicKey: raw.toString('base64url'), privateKey: priv.d }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { publicKey, privateKey } = generateVapidKeys()
  console.log(`
Chaves geradas. Guarde as duas em um lugar seguro.

1) No site (arquivo .env e variáveis da Vercel):
   VITE_VAPID_PUBLIC_KEY=${publicKey}

2) Na Edge Function send-reminders do Supabase (Secrets):
   VAPID_PUBLIC_KEY=${publicKey}
   VAPID_PRIVATE_KEY=${privateKey}

A chave privada é secreta: não coloque no site nem no GitHub.
`)
}
