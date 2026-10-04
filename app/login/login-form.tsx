"use client";

import { useState, type FormEvent } from "react";

export const DASHBOARD_PATH = "/today";

export type LoginState = {
  step: "phone" | "code";
  phone: string;
  error: string | null;
  redirectTo: string | null;
};

export const INITIAL_LOGIN_STATE: LoginState = {
  step: "phone",
  phone: "",
  error: null,
  redirectTo: null,
};

type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ json(): Promise<unknown> }>;

async function postJson(
  fetchImpl: FetchLike,
  url: string,
  payload: Record<string, string>
): Promise<{ ok: boolean; phone?: string; error: string | null }> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { ok?: boolean; phone?: string; error?: string };
    if (data.ok === true) return { ok: true, phone: data.phone, error: null };
    return { ok: false, error: data.error ?? "request_failed" };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** Posts the phone to the login endpoint; on success moves to the code step. */
export async function submitPhone(
  state: LoginState,
  phone: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<LoginState> {
  const result = await postJson(fetchImpl, "/api/auth/login", { phone });
  if (!result.ok) return { ...state, phone, error: result.error };
  return { ...state, step: "code", phone: result.phone ?? phone, error: null };
}

/** Posts the code to the verify endpoint; on success requests a redirect, otherwise stays put. */
export async function submitCode(
  state: LoginState,
  code: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<LoginState> {
  const result = await postJson(fetchImpl, "/api/auth/verify", { phone: state.phone, code });
  if (!result.ok) return { ...state, error: result.error };
  return { ...state, error: null, redirectTo: DASHBOARD_PATH };
}

type ViewProps = {
  state: LoginState;
  pending?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
};

export function LoginFormView({ state, pending = false, onSubmit }: ViewProps) {
  const isPhone = state.step === "phone";
  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Login form">
      {isPhone ? (
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Phone number</span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            defaultValue={state.phone}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
      ) : (
        <label className="block space-y-2 text-sm text-slate-300">
          <span>Verification code sent to {state.phone}</span>
          <input
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          />
        </label>
      )}
      {state.error ? (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
      >
        {isPhone ? "Send code" : "Verify"}
      </button>
    </form>
  );
}

export default function LoginForm() {
  const [state, setState] = useState<LoginState>(INITIAL_LOGIN_STATE);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    const next =
      state.step === "phone"
        ? await submitPhone(state, String(data.get("phone") ?? ""))
        : await submitCode(state, String(data.get("code") ?? ""));
    setPending(false);
    setState(next);
    if (next.redirectTo) window.location.assign(next.redirectTo);
  }

  return <LoginFormView state={state} pending={pending} onSubmit={handleSubmit} />;
}
