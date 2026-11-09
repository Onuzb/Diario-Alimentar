import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { env } from '@/config/env'
import { DiaryRedirect, DiaryRoute } from '@/pages/DiaryPage'
import { ExperiencesPage } from '@/pages/ExperiencesPage'
import { FoodDetailPage } from '@/pages/FoodDetailPage'
import { FoodsPage } from '@/pages/FoodsPage'
import { HomePage } from '@/pages/HomePage'
import { MissingConfig } from '@/pages/MissingConfig'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { HistoryCalendarPage } from '@/pages/history/HistoryCalendarPage'
import { HistoryLayout } from '@/pages/history/HistoryLayout'
import { TimelinePage } from '@/pages/history/TimelinePage'

// O relatório carrega a biblioteca de gráficos, que é pesada: só baixa quando a aba é aberta.
const ReportsPage = lazy(() => import('@/pages/history/ReportsPage').then((m) => ({ default: m.ReportsPage })))

function ReportsRoute() {
  return (
    <Suspense fallback={<div role="status" aria-label="Carregando o relatório" className="min-h-24" />}>
      <ReportsPage />
    </Suspense>
  )
}

export function App() {
  if (!env.isConfigured) return <MissingConfig />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="diario" element={<DiaryRedirect />} />
        <Route path="diario/:date" element={<DiaryRoute />} />
        <Route path="experiencias" element={<ExperiencesPage />} />
        <Route path="experiencias/:id" element={<ExperiencesPage />} />
        <Route path="historico" element={<HistoryLayout />}>
          <Route index element={<HistoryCalendarPage />} />
          <Route path="linha-do-tempo" element={<TimelinePage />} />
          <Route path="acompanhamento" element={<ReportsRoute />} />
          <Route path="*" element={<Navigate to="/historico" replace />} />
        </Route>
        <Route path="alimentos" element={<FoodsPage />} />
        <Route path="alimentos/:id" element={<FoodDetailPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
