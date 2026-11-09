import { Apple, BookOpen, CalendarDays, Home, Settings, Sprout, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/diario', label: 'Meu diário', icon: BookOpen },
  { to: '/experiencias', label: 'Experiências alimentares', icon: Sprout },
  { to: '/historico', label: 'Histórico', icon: CalendarDays },
  { to: '/alimentos', label: 'Alimentos registrados', icon: Apple },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]
