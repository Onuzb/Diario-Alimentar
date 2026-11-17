import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMonthKey } from '@/lib/dates'
import type { ReportData } from '@/types/database'

const SAGE = '#587358'
const EARTH = '#96724a'
const INK_SOFT = '#566052'
const GRID = '#e0d8c4'

const tooltipStyle = {
  background: '#fffdf8',
  border: '1px solid #cfc5ab',
  borderRadius: 12,
  fontSize: 14,
  color: '#29322a',
}

/** Alimentos mais registrados (barras horizontais). Só contagem, sem juízo. */
export function TopFoodsChart({ data }: { data: ReportData['top_foods'] }) {
  const rows = data.map((d) => ({ name: d.name, times: d.times }))
  const height = Math.max(120, rows.length * 44 + 16)
  return (
    <figure aria-label="Alimentos mais registrados" className="m-0">
      <div style={{ height }} role="img" aria-label={`Gráfico de barras: ${rows.map((r) => `${r.name} ${r.times}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="name"
              width={112}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#29322a', fontSize: 14 }}
            />
            <Tooltip cursor={{ fill: '#e3ebdd55' }} contentStyle={tooltipStyle} formatter={(v) => [`${v} vezes`, 'Registrado']} />
            <Bar dataKey="times" fill={SAGE} radius={[0, 8, 8, 0]} barSize={22} isAnimationActive={false}>
              <LabelList dataKey="times" position="right" style={{ fill: INK_SOFT, fontSize: 13 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Alimentos mais registrados</caption>
        <thead>
          <tr>
            <th>Alimento</th>
            <th>Vezes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.times}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

/** Experiências por mês, separadas em alimento novo e substituição. */
export function ExperiencesByMonthChart({ data }: { data: ReportData['experiences_by_month'] }) {
  const rows = data.map((d) => ({
    month: formatMonthKey(d.month),
    'Alimento novo': d.new_food,
    'Substituição alimentar': d.substitution,
  }))
  return (
    <figure aria-label="Experiências por mês" className="m-0">
      <div
        style={{ height: 260 }}
        role="img"
        aria-label={`Gráfico de barras por mês: ${rows
          .map((r) => `${r.month}, ${r['Alimento novo']} novos e ${r['Substituição alimentar']} substituições`)
          .join('; ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: GRID }} tick={{ fill: INK_SOFT, fontSize: 13 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: INK_SOFT, fontSize: 13 }} />
            <Tooltip cursor={{ fill: '#e3ebdd55' }} contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 14, color: '#29322a' }} />
            <Bar dataKey="Alimento novo" stackId="a" fill={SAGE} barSize={28} isAnimationActive={false} />
            <Bar dataKey="Substituição alimentar" stackId="a" fill={EARTH} radius={[6, 6, 0, 0]} barSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Experiências por mês</caption>
        <thead>
          <tr>
            <th>Mês</th>
            <th>Alimento novo</th>
            <th>Substituição alimentar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              <td>{r['Alimento novo']}</td>
              <td>{r['Substituição alimentar']}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
