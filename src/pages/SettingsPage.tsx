import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, Download, PlugZap } from 'lucide-react'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { env, supabaseHost } from '@/config/env'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { TIME_ZONE, todayISO } from '@/lib/dates'
import { getErrorMessage } from '@/lib/errors'
import { runConnectionCheck } from '@/services/diagnostics'
import { exportAll } from '@/services/reports'
import type { ExportData } from '@/types/database'

function downloadJson(data: ExportData, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-card border border-line bg-card p-5 sm:p-6">
      <h2 id={id} className="text-xl">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-ink-soft">{children}</div>
    </section>
  )
}

/** Configurações (padrão Configuração): cópia dos dados, conexão e avisos de uso. */
export function SettingsPage() {
  useDocumentTitle('Configurações')
  const toast = useToast()

  const exportMutation = useMutation({
    mutationFn: exportAll,
    onSuccess: (data) => {
      downloadJson(data, `diario-alimentar-${todayISO()}.json`)
      toast.success('Cópia dos dados baixada.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const checkMutation = useMutation({ mutationFn: runConnectionCheck })

  return (
    <>
      <PageHeader title="Configurações" description="Cópia dos seus dados e informações sobre como o diário funciona." />

      <div className="flex max-w-3xl flex-col gap-6">
        <Section id="export-title" title="Seus dados">
          <p>
            Baixe uma cópia de tudo o que você registrou (refeições, alimentos e experiências) em um arquivo JSON. Guarde o arquivo onde quiser.
          </p>
          <div>
            <Button
              variant="primary"
              loading={exportMutation.isPending}
              icon={<Download aria-hidden className="size-4" />}
              onClick={() => exportMutation.mutate()}
            >
              Baixar cópia dos dados
            </Button>
          </div>
        </Section>

        <Section id="connection-title" title="Conexão com o banco de dados">
          <p>
            Os registros ficam no Supabase, no projeto{' '}
            <strong className="font-semibold break-all text-ink">{env.isConfigured ? supabaseHost() : 'não configurado'}</strong>.
          </p>
          <div>
            <Button
              variant="secondary"
              loading={checkMutation.isPending}
              icon={<PlugZap aria-hidden className="size-4" />}
              onClick={() => checkMutation.mutate()}
            >
              Testar conexão
            </Button>
          </div>
          {checkMutation.data && (
            <ul aria-label="Resultado do teste de conexão" className="flex flex-col gap-3">
              {checkMutation.data.map((step) => (
                <li key={step.label} className="flex items-start gap-3">
                  {step.ok ? (
                    <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-sage-700" />
                  ) : (
                    <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {step.label}: {step.ok ? 'ok' : 'falhou'}
                    </p>
                    <p>{step.message}</p>
                    {step.detail && <p className="mt-1 font-mono text-[0.8125rem] break-words select-all">{step.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="time-title" title="Datas e horários">
          <p>
            O diário usa o horário de Brasília ({TIME_ZONE}). “Hoje” é sempre o dia de Brasília, mesmo que o aparelho esteja em outro fuso.
          </p>
        </Section>

        <Section id="privacy-title" title="Privacidade e acesso">
          <p>
            Este diário não tem login. Quem tiver o endereço do site consegue ver e alterar os registros. Use-o só para uso pessoal e não divulgue o endereço.
          </p>
          <p>Se mais pessoas forem usar, o próximo passo é adicionar login, para que cada pessoa veja apenas o seu diário.</p>
        </Section>
      </div>
    </>
  )
}
