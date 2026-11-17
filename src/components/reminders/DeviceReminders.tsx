import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, CheckCircle2, CircleAlert, Send } from 'lucide-react'
import { SettingsSection } from '@/components/layout/SettingsSection'
import { Button } from '@/components/ui/Button'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { useToast } from '@/components/ui/Toast'
import { usePushStatus } from '@/hooks/queries'
import { getErrorMessage } from '@/lib/errors'
import { disablePush, enablePush, sendTestPush, type PushStatus } from '@/services/push'

function Note({ tone, children }: { tone: 'ok' | 'warn'; children: React.ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : CircleAlert
  return (
    <p className="flex items-start gap-3">
      <Icon aria-hidden className={tone === 'ok' ? 'mt-0.5 size-5 shrink-0 text-sage-700' : 'mt-0.5 size-5 shrink-0 text-danger'} />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** Por que este aparelho não pode receber lembretes (ou null se pode). */
function blocker(status: PushStatus): React.ReactNode {
  if (!status.support.supported) {
    return status.support.reason === 'ios'
      ? 'No iPhone e no iPad, os avisos só funcionam com o diário instalado na tela de início: abra o site no Safari, toque em Compartilhar, escolha “Adicionar à Tela de Início” e abra o diário por esse ícone. Depois volte aqui.'
      : 'Este navegador não recebe notificações de sites. Use o Chrome, o Edge, o Firefox ou o Brave.'
  }
  if (!status.configured) {
    return 'Falta uma etapa no site: a chave dos lembretes (VITE_VAPID_PUBLIC_KEY) ainda não foi configurada. O passo a passo está na seção “Lembretes de refeição” do README.'
  }
  return null
}

/** Ativa, testa e desativa os avisos neste aparelho. */
export function DeviceReminders() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const status = usePushStatus()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['push-status'] })

  const enable = useMutation({
    mutationFn: enablePush,
    onSuccess: async () => {
      await refresh()
      toast.success('Lembretes ativados neste aparelho.')
    },
    onError: (error) => {
      void refresh()
      toast.error(getErrorMessage(error))
    },
  })
  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: async () => {
      await refresh()
      toast.success('Lembretes desativados neste aparelho.')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const test = useMutation({
    mutationFn: sendTestPush,
    onSuccess: () => toast.success('Aviso de teste enviado. Ele deve aparecer em alguns segundos.'),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  return (
    <SettingsSection id="device-reminders-title" title="Lembretes neste aparelho">
      <p>
        Quando uma refeição ainda não tem registro, o diário avisa com “Falta registrar”, mesmo com o site fechado. Cada horário avisa duas vezes: no meio e 10 minutos antes do fim.
      </p>

      {status.isLoading && <p role="status">Verificando este aparelho…</p>}
      {status.isError && <ErrorPanel error={status.error} onRetry={() => void status.refetch()} title="Não foi possível verificar os lembretes" />}

      {status.data && (
        <>
          {blocker(status.data) ? (
            <Note tone="warn">{blocker(status.data)}</Note>
          ) : status.data.subscribed ? (
            <>
              <Note tone="ok">
                <strong className="font-semibold text-ink">Lembretes ativados neste aparelho.</strong> Para receber em outro aparelho, abra o diário nele e ative por lá.
              </Note>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={test.isPending} icon={<Send aria-hidden className="size-4" />} onClick={() => test.mutate()}>
                  Enviar aviso de teste
                </Button>
                <Button variant="ghost" loading={disable.isPending} icon={<BellOff aria-hidden className="size-4" />} onClick={() => disable.mutate()}>
                  Desativar lembretes
                </Button>
              </div>
            </>
          ) : (
            <>
              {status.data.permission === 'denied' && (
                <Note tone="warn">
                  As notificações estão bloqueadas neste navegador. Libere no cadeado ao lado do endereço do site e toque em Ativar lembretes de novo.
                </Note>
              )}
              <div>
                <Button variant="primary" loading={enable.isPending} icon={<BellRing aria-hidden className="size-4" />} onClick={() => enable.mutate()}>
                  Ativar lembretes
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </SettingsSection>
  )
}
