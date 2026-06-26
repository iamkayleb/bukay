import { requireSession } from "@/app/lib/auth/require-session";

import { AppShell } from "./_components/app-shell";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = requireSession();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <AppShell tenantName="Bukay" userPhone={session.phone}>
        {children}
      </AppShell>
    </div>
  );
}
