import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession } from "@/app/lib/auth/session";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { AppShell } from "./components/app-shell";

export const dynamic = "force-dynamic";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySession(token) : null;

  if (!session) {
    redirect("/login");
  }

  const headerList = headers();
  const tenant = resolveTenant({
    headers: { get: (name) => headerList.get(name) },
    session: null,
  });

  const tenantName = tenant.tenantSlug ?? tenant.tenantId ?? "Bukay";
  const userPhone = session.phone;

  return (
    <AppShell tenantName={tenantName} userPhone={userPhone}>
      {children}
    </AppShell>
  );
}
