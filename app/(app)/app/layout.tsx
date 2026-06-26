import { requireSession } from "@/app/lib/auth/require-session";

import { AppSidebar } from "./_components/sidebar";
import { AppTopBar } from "./_components/top-bar";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = requireSession();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="min-w-0 flex-1">
          <AppTopBar tenantName="Bukay" userPhone={session.phone} />
          {children}
        </div>
      </div>
    </div>
  );
}
