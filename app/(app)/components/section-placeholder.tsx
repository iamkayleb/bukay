type SectionPlaceholderProps = {
  title: string;
  description: string;
  hint?: string;
};

export function SectionPlaceholder({ title, description, hint }: SectionPlaceholderProps) {
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-14">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          {title}
        </p>
        <h2 className="text-2xl font-semibold text-white sm:text-3xl">{title}</h2>
        <p className="max-w-xl text-sm text-slate-300 sm:text-base">{description}</p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
        <p className="text-sm text-slate-400">
          {hint ?? "Nothing here yet — content will appear when available."}
        </p>
      </div>
    </section>
  );
}
