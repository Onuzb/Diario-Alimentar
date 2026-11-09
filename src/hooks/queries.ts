import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useToast } from '@/components/ui/Toast'
import { getErrorMessage } from '@/lib/errors'
import { getCalendarMonth, getDashboard, getDay, searchHistory, type HistoryFilters } from '@/services/diaries'
import { getExperience, getExperiences, type ExperienceFilters } from '@/services/experiences'
import { getFoodDetail, listFoods } from '@/services/foods'
import { getReport } from '@/services/reports'

export const HISTORY_PAGE_SIZE = 15
export const EXPERIENCE_PAGE_SIZE = 20

export function useFoods() {
  return useQuery({ queryKey: ['foods'], queryFn: listFoods })
}

export function useDay(date: string) {
  return useQuery({ queryKey: ['day', date], queryFn: () => getDay(date) })
}

export function useCalendarMonth(year: number, month: number) {
  return useQuery({
    queryKey: ['calendar', year, month],
    queryFn: () => getCalendarMonth(year, month),
    placeholderData: keepPreviousData,
  })
}

export function useDashboard(today: string) {
  return useQuery({ queryKey: ['dashboard', today], queryFn: () => getDashboard(today) })
}

export function useHistory(filters: HistoryFilters, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['history', filters],
    queryFn: ({ pageParam }) => searchHistory(filters, HISTORY_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.days.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    enabled,
  })
}

export function useExperienceList(filters: ExperienceFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['experiences', filters],
    queryFn: ({ pageParam }) => getExperiences(filters, EXPERIENCE_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.items.length, 0)
      return loaded < last.total ? loaded : undefined
    },
    enabled,
  })
}

export function useExperience(id: string | undefined) {
  return useQuery({
    queryKey: ['experience', id],
    queryFn: () => getExperience(id as string),
    enabled: Boolean(id),
  })
}

export function useFoodDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['food', id],
    queryFn: () => getFoodDetail(id as string),
    enabled: Boolean(id),
  })
}

export function useReport(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['report', from, to],
    queryFn: () => getReport(from, to),
    enabled,
    placeholderData: keepPreviousData,
  })
}

interface MutationOptions<TData, TVars> {
  /** Mensagem de sucesso (ou função que a monta). */
  success?: string | ((data: TData, vars: TVars) => string)
  onSuccess?: (data: TData, vars: TVars) => void
  /** Falso: o erro não vira aviso (o formulário mostra por conta própria). */
  toastError?: boolean
}

/**
 * Mutação com o comportamento padrão do app: ao dar certo, atualiza todas as
 * consultas e mostra um aviso; ao falhar, mostra o erro em português.
 */
export function useAppMutation<TData, TVars>(
  fn: (vars: TVars) => Promise<TData>,
  options: MutationOptions<TData, TVars> = {},
) {
  const queryClient = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await queryClient.invalidateQueries()
      if (options.success) {
        toast.success(typeof options.success === 'function' ? options.success(data, vars) : options.success)
      }
      options.onSuccess?.(data, vars)
    },
    onError: (error) => {
      if (options.toastError !== false) toast.error(getErrorMessage(error))
    },
  })
}
