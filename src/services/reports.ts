import { callRpc, emptyToNull } from '@/services/client'
import type { ExportData, ReportData } from '@/types/database'

export function getReport(from: string, to: string): Promise<ReportData> {
  return callRpc<ReportData>('get_report', { p_from: emptyToNull(from), p_to: emptyToNull(to) })
}

/** Cópia de todos os dados (usada por "Exportar meus dados"). */
export function exportAll(): Promise<ExportData> {
  return callRpc<ExportData>('export_all', {})
}
