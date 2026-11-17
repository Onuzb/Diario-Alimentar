import { useRef, useState } from 'react'
import { cleanName, findExact, findSimilar, normalizeName, type NamedFood } from '@/lib/foodMatch'

/** Alimento já decidido. id null significa "cadastrar pelo nome". */
export interface ResolvedFood {
  id: string | null
  name: string
}

export type FoodPrompt =
  | { kind: 'same'; typed: string; match: NamedFood }
  | { kind: 'similar'; typed: string; matches: NamedFood[] }
  | { kind: 'new'; typed: string }

/**
 * Estado de um campo de alimento. Antes de salvar, `resolve()` confere o nome
 * digitado e, se preciso, mostra uma pergunta ao lado do campo:
 *  - nome igual a um existente: "É o mesmo alimento?"
 *  - nome parecido: "Parecido com ... É o mesmo?"
 *  - nome novo: "Cadastrar em Alimentos registrados?"
 * A pergunta aparece dentro do próprio formulário (nada de janela sobre janela).
 */
export function useFoodField(foods: readonly NamedFood[], initial?: { id?: string | null; name?: string }) {
  const [text, setTextState] = useState(initial?.name ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(initial?.id ?? null)
  const [intentNew, setIntentNew] = useState(false)
  const [prompt, setPrompt] = useState<FoodPrompt | null>(null)
  const [hint, setHint] = useState('')
  const settle = useRef<((value: ResolvedFood | null) => void) | null>(null)

  function finish(value: ResolvedFood | null) {
    const fn = settle.current
    settle.current = null
    setPrompt(null)
    fn?.(value)
  }

  /** Digitar muda o texto e desfaz qualquer escolha anterior. */
  function setText(value: string) {
    setTextState(value)
    setSelectedId(null)
    setIntentNew(false)
    setHint('')
    if (settle.current) finish(null)
  }

  function select(food: NamedFood) {
    if (settle.current) finish(null)
    setTextState(food.name)
    setSelectedId(food.id)
    setIntentNew(false)
    setHint('')
  }

  /** A pessoa escolheu "Cadastrar como novo alimento" na lista. */
  function chooseNew() {
    setIntentNew(true)
    setSelectedId(null)
  }

  function reset(next?: { id?: string | null; name?: string }) {
    if (settle.current) finish(null)
    setTextState(next?.name ?? '')
    setSelectedId(next?.id ?? null)
    setIntentNew(false)
    setHint('')
  }

  /** Decide qual alimento usar. Devolve null se faltar nome ou a pessoa voltou atrás. */
  function resolve(): Promise<ResolvedFood | null> {
    const typed = cleanName(text)
    if (!typed) return Promise.resolve(null)

    if (selectedId) {
      const chosen = foods.find((f) => f.id === selectedId)
      if (chosen && normalizeName(chosen.name) === normalizeName(typed)) {
        return Promise.resolve({ id: chosen.id, name: chosen.name })
      }
    }

    if (settle.current) finish(null)
    const exact = findExact(foods, typed)
    const similar = exact ? [] : findSimilar(foods, typed)

    return new Promise<ResolvedFood | null>((resolvePromise) => {
      settle.current = resolvePromise
      if (exact) {
        setPrompt({ kind: 'same', typed, match: exact })
      } else if (similar.length > 0) {
        setPrompt({ kind: 'similar', typed, matches: similar })
      } else if (intentNew) {
        finish({ id: null, name: typed })
      } else {
        setPrompt({ kind: 'new', typed })
      }
    })
  }

  const answer = {
    /** "Sim, é o mesmo": usa o alimento existente. */
    useExisting(food: NamedFood) {
      setTextState(food.name)
      setSelectedId(food.id)
      setHint('')
      finish({ id: food.id, name: food.name })
    },
    /** "Não, cadastrar como novo" (nome parecido) ou "Cadastrar" (nome novo). */
    createNew() {
      const typed = cleanName(text)
      setIntentNew(true)
      finish({ id: null, name: typed })
    },
    /** "Não, é outro" diante de um nome igual: pede para ajustar o nome. */
    rename() {
      const match = prompt?.kind === 'same' ? prompt.match : null
      setHint(
        match
          ? `Já existe “${match.name}”. Ajuste o nome para diferenciar, por exemplo “${match.name} integral”.`
          : 'Ajuste o nome do alimento.',
      )
      finish(null)
    },
    /** Voltar sem decidir. */
    cancel() {
      finish(null)
    },
  }

  return { text, selectedId, intentNew, prompt, hint, setText, select, chooseNew, reset, resolve, answer }
}

export type FoodFieldController = ReturnType<typeof useFoodField>
