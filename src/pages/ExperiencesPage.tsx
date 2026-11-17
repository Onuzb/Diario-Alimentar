import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ExperienceCard } from '@/components/experiences/ExperienceCard'
import { ExperienceDeleteDialog } from '@/components/experiences/ExperienceDeleteDialog'
import { ExperienceForm } from '@/components/experiences/ExperienceForm'
import { PageHeader } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { CardSkeleton, LoadingArea } from '@/components/ui/Skeleton'
import { useExperience, useExperienceList } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { isISODate } from '@/lib/dates'
import type { Experience } from '@/types/database'

const NO_FILTERS = { type: '', from: '', to: '', foodId: '' } as const

function RecentExperiences() {
  const { data, isLoading, isError, error, refetch } = useExperienceList(NO_FILTERS)
  const [toDelete, setToDelete] = useState<Experience | null>(null)
  const items = (data?.pages[0]?.items ?? []).slice(0, 5)

  return (
    <section aria-labelledby="recent-exp" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-exp" className="text-xl">
          Experiências recentes
        </h2>
        <Link to="/historico/linha-do-tempo" className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-sage-800 hover:bg-sage-100">
          Ver linha do tempo
        </Link>
      </div>
      {isLoading && (
        <LoadingArea loading label="Carregando experiências" className="flex flex-col gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </LoadingArea>
      )}
      {isError && <ErrorPanel error={error} onRetry={() => void refetch()} />}
      {data && items.length === 0 && (
        <EmptyState
          tone="dashed"
          title="Nenhuma experiência registrada"
          description="Quando você provar um alimento novo ou trocar um alimento por outro, registre aqui como foi. Ela aparece nesta lista."
        />
      )}
      {items.map((e) => (
        <ExperienceCard key={e.id} experience={e} onDelete={setToDelete} />
      ))}
      <ExperienceDeleteDialog experience={toDelete} onClose={() => setToDelete(null)} />
    </section>
  )
}

function NewExperience() {
  useDocumentTitle('Experiências alimentares')
  const [params] = useSearchParams()
  const [formKey, setFormKey] = useState(0)
  const dateParam = params.get('data') ?? ''
  const foodParam = params.get('alimento') ?? ''
  const timeParam = params.get('hora') ?? ''

  const defaults = {
    foodName: foodParam,
    date: isISODate(dateParam) ? dateParam : undefined,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(timeParam) ? timeParam : undefined,
  }

  return (
    <>
      <PageHeader
        title="Registro de experiência alimentar"
        description="Anote como foi provar um alimento novo ou trocar um alimento por outro."
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start">
        <section aria-label="Formulário de experiência" className="rounded-card border border-line bg-card p-5 sm:p-6">
          <ExperienceForm key={formKey} defaults={defaults} onSaved={() => setFormKey((k) => k + 1)} />
        </section>
        <RecentExperiences />
      </div>
    </>
  )
}

function EditExperience({ id }: { id: string }) {
  useDocumentTitle('Editar experiência')
  const navigate = useNavigate()
  const { data, isLoading, isError, error, refetch } = useExperience(id)

  return (
    <>
      <PageHeader title="Editar experiência alimentar" description="Mude o que quiser. As informações antigas ficam como estão até você salvar." />
      {isLoading && (
        <LoadingArea loading label="Carregando a experiência">
          <CardSkeleton lines={6} />
        </LoadingArea>
      )}
      {isError && <ErrorPanel error={error} onRetry={() => void refetch()} />}
      {!isLoading && !isError && data === null && (
        <EmptyState
          tone="dashed"
          title="Experiência não encontrada"
          description="Ela pode ter sido excluída. Volte para o registro e crie uma nova, se quiser."
          action={
            <ButtonLink to="/experiencias" variant="primary">
              Registrar experiência alimentar
            </ButtonLink>
          }
        />
      )}
      {data && (
        <section aria-label="Formulário de experiência" className="max-w-[36rem] rounded-card border border-line bg-card p-5 sm:p-6">
          <ExperienceForm
            experience={data}
            submitLabel="Salvar alterações"
            onCancel={() => navigate('/experiencias')}
            onSaved={() => navigate('/experiencias')}
          />
        </section>
      )}
    </>
  )
}

export function ExperiencesPage() {
  const { id } = useParams()
  return id ? <EditExperience id={id} /> : <NewExperience />
}
