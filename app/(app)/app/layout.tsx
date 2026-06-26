import { requireSession } from "@/app/lib/auth/require-session";

export default function AuthenticatedAppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  requireSession();

  return children;
}
