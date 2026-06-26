export const metadata = {
  title: "Sign in to Bukay",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12 text-slate-100">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Bukay</p>
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="text-sm text-slate-300">
          Enter your phone number to receive a one-time verification code.
        </p>
      </header>
      <section
        aria-label="Login form"
        className="rounded-lg border border-slate-800 bg-slate-900/60 p-6"
      >
        <p className="text-sm text-slate-300">
          The login flow is wired through <code className="text-emerald-300">/api/auth/login</code>{" "}
          and <code className="text-emerald-300">/api/auth/verify</code>.
        </p>
      </section>
    </main>
  );
}
