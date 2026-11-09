import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAppMutation } from '@/hooks/queries'
import { formatShortDate } from '@/lib/dates'
import { deleteExperience } from '@/services/experiences'
import type { Experience } from '@/types/database'

/** Confirmação para excluir uma experiência alimentar (nome o alimento e a data). */
export function ExperienceDeleteDialog({ experience, onClose }: { experience: Experience | null; onClose: () => void }) {
  const mutation = useAppMutation(deleteExperience, { success: 'Experiência excluída.', onSuccess: onClose })
  return (
    <ConfirmDialog
      open={experience !== null}
      title={experience ? `Excluir a experiência com “${experience.food_name}” de ${formatShortDate(experience.experience_date)}?` : ''}
      confirmLabel="Excluir experiência"
      loading={mutation.isPending}
      onCancel={onClose}
      onConfirm={() => experience && mutation.mutate(experience.id)}
    >
      Os sentimentos, pensamentos e observações desta experiência serão apagados. O alimento continua em Alimentos registrados.
    </ConfirmDialog>
  )
}
