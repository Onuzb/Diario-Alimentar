import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { IconButton } from '@/components/ui/Button'
import { SlideOver } from '@/components/ui/SlideOver'
import { NAV_ITEMS } from '@/components/layout/nav'
import { cn } from '@/lib/cn'

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <svg aria-hidden viewBox="0 0 64 64" className="size-8 shrink-0">
        <rect width="64" height="64" rx="16" fill="#455c47" />
        <path d="M32 50V30" stroke="#f4f0e4" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M32 32c0-9 6-15 15-15 0 9-6 15-15 15Z" fill="#f4f0e4" />
        <path d="M32 40c0-7-5-12-12-12 0 7 5 12 12 12Z" fill="#cbdac3" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-ink">Diário alimentar</span>
    </div>
  )
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Principal">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.95rem] font-medium transition-colors duration-150',
                  isActive ? 'bg-sage-100 text-sage-900' : 'text-ink-soft hover:bg-sage-50 hover:text-ink',
                )
              }
            >
              <Icon aria-hidden className="size-5 shrink-0" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Estrutura do app: menu lateral no computador, cabeçalho com menu no celular. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh w-full md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[80] focus:rounded-full focus:bg-sage-800 focus:px-4 focus:py-2 focus:text-white"
      >
        Pular para o conteúdo
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-line bg-sand-50 px-4 py-6 md:flex">
        <div className="px-2">
          <Brand />
        </div>
        <NavList />
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper pr-2 pl-4 md:hidden">
          <Brand />
          <IconButton label="Abrir menu" onClick={() => setMenuOpen(true)}>
            <Menu aria-hidden className="size-6" />
          </IconButton>
        </header>

        <main id="conteudo" tabIndex={-1} className="page py-6 md:py-10">
          <Outlet />
        </main>
      </div>

      <SlideOver open={menuOpen} title="Menu" side="left" onClose={() => setMenuOpen(false)}>
        <NavList onNavigate={() => setMenuOpen(false)} />
      </SlideOver>
    </div>
  )
}
