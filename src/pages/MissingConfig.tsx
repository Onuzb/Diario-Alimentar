import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Tela mostrada enquanto o arquivo .env não está preenchido com os dados do Supabase. */
export function MissingConfig() {
  useDocumentTitle('Configuração necessária')
  return (
    <main className="page flex min-h-dvh items-center py-10">
      <div className="mx-auto w-full max-w-xl rounded-card border border-line bg-card p-6 sm:p-8">
        <h1 className="text-[1.75rem] leading-tight">Falta conectar o banco de dados</h1>
        <p className="mt-2 text-ink-soft">
          O diário guarda os registros no Supabase. Faça estes passos uma vez e recarregue a página.
        </p>
        <ol className="mt-5 flex list-decimal flex-col gap-3 pl-5 marker:font-semibold">
          <li>
            Copie o arquivo <code className="rounded bg-sand-100 px-1.5 py-0.5 text-[0.9em]">.env.example</code> e renomeie a cópia para{' '}
            <code className="rounded bg-sand-100 px-1.5 py-0.5 text-[0.9em]">.env</code>.
          </li>
          <li>
            No Supabase, abra <strong>Project Settings &gt; API</strong> e copie a <strong>Project URL</strong> e a chave <strong>anon public</strong>.
          </li>
          <li>
            Cole os dois valores em <code className="rounded bg-sand-100 px-1.5 py-0.5 text-[0.9em]">VITE_SUPABASE_URL</code> e{' '}
            <code className="rounded bg-sand-100 px-1.5 py-0.5 text-[0.9em]">VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>Pare o servidor (Ctrl+C) e rode de novo com npm run dev.</li>
        </ol>
        <p className="mt-5 text-sm text-ink-soft">
          O passo a passo completo, com os scripts SQL das tabelas, está no arquivo README.md.
        </p>
      </div>
    </main>
  )
}
