import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/cn'

const TABS = [
  { to: '/historico', label: 'Calendário', end: true },
  { to: '/historico/linha-do-tempo', label: 'Linha do tempo', end: false },
  { to: '/historico/acompanhamento', label: 'Relatório', end: false },
]

/** Cabeçalho e abas do Histórico. Cada aba é uma visão dos mesmos registros. */
export function HistoryLayout() {
  return (
    <>
      <PageHeader
        title="Histórico"
        description="Reveja dias anteriores, acompanhe as experiências ao longo do tempo e veja um resumo do que foi registrado."
      />
      <nav aria-label="Seções do histórico" className="mb-6 overflow-x-auto">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    '-mb-px flex min-h-11 items-center border-b-2 px-4 font-semibold transition-colors duration-150',
                    isActive
                      ? 'border-sage-700 text-sage-900'
                      : 'border-transparent text-ink-soft hover:border-sage-300 hover:text-ink',
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  )
}
