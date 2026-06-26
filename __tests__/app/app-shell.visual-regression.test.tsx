import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/app/(app)/app/_components/app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("AppShell visual regression", () => {
  it("keeps the authenticated mobile shell structure stable", () => {
    const html = renderToStaticMarkup(
      <AppShell tenantName="Studio Kay" userPhone="+2348031234567">
        <main className="min-h-[calc(100vh-65px)] bg-slate-950 px-4 py-8 text-slate-100">
          <section className="mx-auto flex max-w-5xl flex-col gap-8">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
                Today
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Today</h1>
            </div>
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-5 py-10 sm:px-8">
              <p className="text-lg font-semibold text-white">Nothing here yet</p>
            </div>
          </section>
        </main>
      </AppShell>
    );

    expect(html).toMatchInlineSnapshot(
      `"<div class="flex min-h-screen"><aside class="shrink-0 bg-slate-950 px-4 py-6 text-slate-200 hidden min-h-screen w-64 border-r border-slate-800 md:flex md:flex-col"><div class="px-3 pb-6"><p class="text-sm font-semibold text-white">Bukay</p></div><nav aria-label="Workspace" class="flex flex-1 flex-col gap-1"><a aria-current="page" class="rounded-md px-3 py-2 text-sm font-medium transition-colors bg-emerald-500 text-slate-950" href="/app">Today</a><a class="rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-300 hover:bg-slate-900 hover:text-white" href="/app/calendar">Calendar</a><a class="rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-300 hover:bg-slate-900 hover:text-white" href="/app/clients">Clients</a><a class="rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-300 hover:bg-slate-900 hover:text-white" href="/app/services">Services</a><a class="rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-300 hover:bg-slate-900 hover:text-white" href="/app/settings">Settings</a></nav></aside><div class="min-w-0 flex-1"><header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur md:px-6"><div class="flex items-center justify-between gap-4"><div class="flex min-w-0 items-center gap-3"><button type="button" aria-label="Open navigation" aria-controls="mobile-navigation" class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800 md:hidden"><span aria-hidden="true" class="flex flex-col gap-1"><span class="block h-0.5 w-4 rounded-full bg-current"></span><span class="block h-0.5 w-4 rounded-full bg-current"></span><span class="block h-0.5 w-4 rounded-full bg-current"></span></span></button><div class="min-w-0"><p class="truncate text-sm font-semibold text-white">Studio Kay</p><p class="truncate text-xs text-slate-400">Workspace</p></div></div><div class="relative"><button type="button" aria-haspopup="menu" aria-expanded="false" class="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:border-slate-600 hover:bg-slate-800"><span class="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400 text-xs font-bold text-slate-950">67</span><span class="hidden max-w-44 truncate sm:inline">+2348031234567</span></button></div></div></header><main class="min-h-[calc(100vh-65px)] bg-slate-950 px-4 py-8 text-slate-100"><section class="mx-auto flex max-w-5xl flex-col gap-8"><div><p class="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Today</p><h1 class="mt-2 text-3xl font-semibold text-white">Today</h1></div><div class="rounded-lg border border-dashed border-slate-700 bg-slate-900/40 px-5 py-10 sm:px-8"><p class="text-lg font-semibold text-white">Nothing here yet</p></div></section></main></div></div>"`
    );
  });
});
