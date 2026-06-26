import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, type SessionPayload, verifySession } from "@/app/lib/auth/session";

export function getSessionFromCookieValue(token: string | null | undefined): SessionPayload | null {
  if (!token) return null;
  return verifySession(token);
}

export function requireSession(): SessionPayload {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = getSessionFromCookieValue(token);

  if (!session) {
    redirect("/login");
  }

  return session;
}
