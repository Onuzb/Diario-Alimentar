import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Apple, Check, ChevronRight, Pencil, Search, Trash2, X } from 'lucide-react'
import { FoodField } from '@/components/foods/FoodField'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorPanel } from '@/components/ui/ErrorPanel'
import { controlClasses } from '@/components/ui/Field'
import { SkeletonBlock } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useAppMutation, useFoods } from '@/hooks/queries'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useFoodField } from '@/hooks/useFoodField'
import { cn } from '@/lib/cn'
import { formatShortDate } from '@/lib/dates'
import { cleanName, normalizeName } from '@/lib/foodMatch'
import { plural } from '@/lib/format'
import { foodNameSchema } from '@/lib/validation'
import { createFood, deleteFood, renameFood } from '@/services/foods'
import type { FoodOverview } from '@/types/database'

type SortKey = 'name' | 'most' | 'recent'

const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[minmax(0,2.4fr)_8rem_7rem_7rem_8.25rem]'

function sortFoods(foods: FoodOverview[], key: SortKey): FoodOverview[] {
  const list = [...foods]
  if (key === 'most') {
    list.sort((a, b) => b.times_consumed - a.times_consumed || a.name.localeCompare(b.name, 'pt-BR'))
  } else if (key === 'recent') {
    const date = (f: FoodOverview) => f.first_record_date ?? ''
    list.sort((a, b) => date(b).localeCompare(date(a)) || a.name.localeCompare(b.name, 'pt-BR'))
  }
  return list
}

/** Alimentos registrados (padrão Lista): cadastrar, pesquisar, renomear no lugar e excluir. */
export function FoodsPage() {
  useDocumentTitle('Alimentos registrados')
  const toast = useToast()
  const { data: foods = [], isLoading, isError, error, refetch } = useFoods()

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('name')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [toDelete, setToDelete] = useState<FoodOverview | null>(null)
  const addInput = useRef<HTMLInputElement | null>(null)

  const addField = useFoodField(foods)
  const [addError, setAddError] = useState('')
  useEffect(() => {
    if (addError && addField.text.trim()) setAddError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addField.text])

  const createMutation = useAppMutation(createFood, {
    success: (_id, name) => `“${name}” cadastrado em Alimentos registrados.`,
    onSuccess: () => addField.reset(),
  })
  const renameMutation = useAppMutation((v: { id: string; name: string }) => renameFood(v.id, v.name), {
    success: 'Alimento renomeado.',
    onSuccess: () => setEditingId(null),
  })
  const deleteMutation = useAppMutation(deleteFood, {
    success: 'Alimento excluído.',
    onSuccess: () => setToDelete(null),
  })

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault()
    const typed = cleanName(addField.text)
    const parsed = foodNameSchema.safeParse({ name: typed })
    if (!parsed.success) {
      setAddError(parsed.error.issues[0]?.message ?? 'Informe o nome do alimento.')
      addInput.current?.focus()
      return
    }
    setAddError('')
    addField.chooseNew()
    const food = await addField.resolve()
    if (!food) return
    if (food.id) {
      toast.success(`“${food.name}” já está no cadastro.`)
      addField.reset()
      setSearch(food.name)
      return
    }
    createMutation.mutate(food.name)
  }

  function startRename(food: FoodOverview) {
    setEditingId(food.id)
    setDraft(food.name)
  }

  function submitRename(food: FoodOverview) {
    const parsed = foodNameSchema.safeParse({ name: draft })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Informe o nome do alimento.')
      return
    }
    if (parsed.data.name === food.name) {
      setEditingId(null)
      return
    }
    renameMutation.mutate({ id: food.id, name: parsed.data.name })
  }

  const visible = useMemo(() => {
    const key = normalizeName(search)
    const filtered = key ? foods.filter((f) => normalizeName(f.name).includes(key)) : foods
    return sortFoods(filtered, sort)
  }, [foods, search, sort])

  const hasFilter = search.trim() !== ''

  return (
    <>
      <PageHeader
        title="Alimentos registrados"
        description="Tudo o que você já registrou, com quantas vezes cada alimento apareceu em refeições e experiências."
      />

      <form
        noValidate
        onSubmit={(e) => void submitCreate(e)}
        className="mb-6 flex flex-col gap-3 rounded-card border border-line bg-card p-4 sm:p-5"
      >
        <FoodField
          field={addField}
          foods={foods}
          label="Cadastrar alimento"
          placeholder="Nome do alimento, como “Kiwi”"
          error={addError}
          confirmNewLabel="Cadastrar"
          allowCreateOption={false}
          inputRef={(el) => {
            addInput.current = el
          }}
        />
        <div>
          <Button type="submit" loading={createMutation.isPending}>
            Cadastrar alimento
          </Button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="relative min-w-60 flex-1">
          <label htmlFor="food-search" className="mb-1.5 block text-sm font-semibold">
            Pesquisar alimentos
          </label>
          <Search aria-hidden className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-ink-soft" />
          <input
            id="food-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por nome"
            className={cn(controlClasses(), 'pl-10')}
          />
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="food-sort" className="mb-1.5 block text-sm font-semibold">
            Ordenar por
          </label>
          <select id="food-sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={cn(controlClasses(), 'pr-9')}>
            <option value="name">Nome (A a Z)</option>
            <option value="most">Mais registrados</option>
            <option value="recent">Primeiro registro mais recente</option>
          </select>
        </div>
      </div>

      {isError && <ErrorPanel error={error} onRetry={() => void refetch()} />}

      {!isError && (
        <section aria-label="Lista de alimentos" className="overflow-hidden rounded-card border border-line bg-card">
          <div role="table" aria-label="Alimentos registrados" aria-rowcount={visible.length + 1}>
            <div role="rowgroup" className="hidden border-b border-line bg-sand-50 md:block">
              <div role="row" className={cn(GRID, 'px-5 py-2.5 text-sm font-semibold text-ink-soft')}>
                <span role="columnheader">Alimento</span>
                <span role="columnheader">Primeiro registro</span>
                <span role="columnheader">Refeições</span>
                <span role="columnheader">Experiências</span>
                <span role="columnheader" className="text-right">
                  Ações
                </span>
              </div>
            </div>

            <div role="rowgroup">
              {isLoading &&
                Array.from({ length: 5 }, (_, i) => (
                  <div key={i} role="row" className="border-b border-line px-5 py-4 last:border-b-0">
                    <SkeletonBlock className="h-5 w-2/3" />
                  </div>
                ))}

              {!isLoading && foods.length === 0 && (
                <EmptyState
                  icon={<Apple className="size-5" />}
                  title="Nenhum alimento cadastrado"
                  description="Os alimentos entram aqui quando você os adiciona a uma refeição ou os cadastra acima. Assim você acompanha quantas vezes cada um apareceu."
                  action={<Button onClick={() => addInput.current?.focus()}>Cadastrar alimento</Button>}
                />
              )}

              {!isLoading && foods.length > 0 && visible.length === 0 && (
                <EmptyState
                  title={`Nenhum alimento corresponde a “${search.trim()}”`}
                  description="Confira a escrita ou limpe a busca para ver todos os alimentos."
                  action={<Button variant="secondary" onClick={() => setSearch('')}>Limpar busca</Button>}
                />
              )}

              {visible.map((food) => {
                const editing = editingId === food.id
                const first = food.first_record_date
                return (
                  <div key={food.id} role="row" className={cn(GRID, 'min-h-16 border-b border-line px-5 py-2 last:border-b-0 hover:bg-sage-50/60')}>
                    <div role="cell" className="grid min-w-0 [&>*]:col-start-1 [&>*]:row-start-1">
                      {editing ? (
                        <input
                          autoFocus
                          aria-label={`Novo nome para ${food.name}`}
                          value={draft}
                          maxLength={80}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              submitRename(food)
                            } else if (e.key === 'Escape') {
                              e.stopPropagation()
                              setEditingId(null)
                            }
                          }}
                          className={cn(controlClasses(), 'h-11')}
                        />
                      ) : (
                        <Link
                          to={`/alimentos/${food.id}`}
                          className="flex h-11 min-w-0 items-center gap-1.5 rounded-lg font-medium hover:text-sage-800"
                        >
                          <span className="truncate">{food.name}</span>
                          <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-soft" />
                        </Link>
                      )}
                    </div>
                    <span role="cell" className="hidden text-ink-soft md:block">
                      {first ? formatShortDate(first) : 'Sem registro'}
                    </span>
                    <span role="cell" className="hidden text-ink-soft md:block">
                      {food.times_consumed}
                    </span>
                    <span role="cell" className="hidden text-ink-soft md:block">
                      {food.experience_count}
                    </span>
                    <div role="cell" className="flex items-center justify-end">
                      {editing ? (
                        <>
                          <IconButton label={`Salvar nome de ${food.name}`} onClick={() => submitRename(food)}>
                            <Check aria-hidden className="size-[1.125rem]" />
                          </IconButton>
                          <IconButton label="Cancelar renomear" onClick={() => setEditingId(null)}>
                            <X aria-hidden className="size-[1.125rem]" />
                          </IconButton>
                        </>
                      ) : (
                        <>
                          <IconButton label={`Renomear ${food.name}`} onClick={() => startRename(food)}>
                            <Pencil aria-hidden className="size-[1.125rem]" />
                          </IconButton>
                          <IconButton label={`Excluir ${food.name}`} tone="danger" onClick={() => setToDelete(food)}>
                            <Trash2 aria-hidden className="size-[1.125rem]" />
                          </IconButton>
                        </>
                      )}
                    </div>
                    <p className="col-span-2 -mt-1 pb-1 text-sm text-ink-soft md:hidden">
                      {plural(food.times_consumed, 'refeição', 'refeições')}, {plural(food.experience_count, 'experiência', 'experiências')}
                      {first ? `, desde ${formatShortDate(first)}` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {!isLoading && foods.length > 0 && (
        <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
          {hasFilter ? `${plural(visible.length, 'alimento encontrado', 'alimentos encontrados')} de ${foods.length}.` : `${plural(foods.length, 'alimento', 'alimentos')} no cadastro.`}
        </p>
      )}

      <ConfirmDialog
        open={toDelete !== null && toDelete.experience_count > 0}
        title={toDelete ? `Não é possível excluir “${toDelete.name}”` : ''}
        onCancel={() => setToDelete(null)}
      >
        Ele tem {toDelete ? plural(toDelete.experience_count, 'experiência registrada', 'experiências registradas') : ''}. Exclua essas experiências
        antes de excluir o alimento. Para corrigir só o nome, use Renomear.
      </ConfirmDialog>

      <ConfirmDialog
        open={toDelete !== null && toDelete.experience_count === 0}
        title={toDelete ? `Excluir “${toDelete.name}”?` : ''}
        confirmLabel="Excluir alimento"
        loading={deleteMutation.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
      >
        {toDelete && toDelete.times_consumed > 0
          ? `Ele aparece em ${plural(toDelete.times_consumed, 'refeição', 'refeições')}. Será removido delas; o restante do registro dessas refeições continua.`
          : 'Ele não aparece em nenhuma refeição.'}
      </ConfirmDialog>
    </>
  )
}
