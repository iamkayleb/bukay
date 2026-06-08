export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-24">
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Bukay</p>
        <h1 className="text-4xl font-semibold text-white md:text-5xl">Next.js starter is ready.</h1>
        <p className="max-w-xl text-base text-slate-300">
          Edit <code className="rounded bg-slate-800 px-2 py-1">app/page.tsx</code> to get started.
        </p>
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-sm text-slate-300">Health check: /api/health</p>
      </div>
    </main>
  );
}
