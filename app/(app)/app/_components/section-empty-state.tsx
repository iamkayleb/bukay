type SectionEmptyStateProps = {
  title: string;
  eyebrow: string;
  description: string;
  primaryAction?: string;
};

export function SectionEmptyState({
  title,
  eyebrow,
  description,
  primaryAction,
}: SectionEmptyStateProps) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-5xl flex-col gap-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
        </div>

        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-5 py-10 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-lg font-semibold text-white">Nothing here yet</p>
            <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>
            {primaryAction ? (
              <button
                type="button"
                className="mt-6 rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-emerald-400"
              >
                {primaryAction}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
