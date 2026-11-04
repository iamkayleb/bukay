"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export const LOGIN_REDIRECT_PATH = "/today";

export type LoginStep = "phone" | "code";

export type LoginFormState = {
  step: LoginStep;
  phone: string;
  error: string | null;
};

export const initialLoginFormState: LoginFormState = {
  step: "phone",
  phone: "",
  error: null,
};

export type AuthResult = { ok: true } | { ok: false; error: string };

type Fetcher = typeof fetch;

const fieldClassName =
  "mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400";

const submitClassName =
  "rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60";

function errorTextFromBody(data: unknown, statusText: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  const fallback = statusText.trim();
  return fallback || "Request failed";
}

async function readAuthResult(response: Response): Promise<AuthResult> {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.ok && data && typeof data === "object" && (data as { ok?: unknown }).ok === true) {
    return { ok: true };
  }

  return { ok: false, error: errorTextFromBody(data, response.statusText) };
}

async function postJson(url: string, body: unknown, fetcher: Fetcher): Promise<AuthResult> {
  const response = await fetcher(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  return readAuthResult(response);
}

export function submitLoginPhone(phone: string, fetcher: Fetcher = fetch): Promise<AuthResult> {
  return postJson("/api/auth/login", { phone }, fetcher);
}

export function submitLoginCode(
  phone: string,
  code: string,
  fetcher: Fetcher = fetch
): Promise<AuthResult> {
  return postJson("/api/auth/verify", { phone, code }, fetcher);
}

export function loginFormAfterPhone(
  state: LoginFormState,
  phone: string,
  result: AuthResult
): LoginFormState {
  if (!result.ok) {
    return { step: "phone", phone, error: result.error };
  }

  return { step: "code", phone, error: null };
}

export function loginFormAfterCode(state: LoginFormState, result: AuthResult): LoginFormState {
  if (!result.ok) {
    return { ...state, step: "code", error: result.error };
  }

  return { ...state, step: "code", error: null };
}

export async function completeLoginCode(input: {
  phone: string;
  code: string;
  fetcher?: Fetcher;
  redirectTo: (path: string) => void;
}): Promise<AuthResult> {
  const result = await submitLoginCode(input.phone, input.code, input.fetcher);
  if (result.ok) {
    input.redirectTo(LOGIN_REDIRECT_PATH);
  }
  return result;
}

type LoginFormFieldsProps = {
  state: LoginFormState;
  code: string;
  pending: boolean;
  onPhoneChange: (phone: string) => void;
  onCodeChange: (code: string) => void;
  onPhoneSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCodeSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function LoginFormFields({
  state,
  code,
  pending,
  onPhoneChange,
  onCodeChange,
  onPhoneSubmit,
  onCodeSubmit,
}: LoginFormFieldsProps) {
  return (
    <section
      aria-label="Login form"
      className="rounded-lg border border-slate-800 bg-slate-900/60 p-6"
    >
      {state.step === "phone" ? (
        <form className="space-y-4" onSubmit={onPhoneSubmit}>
          <label className="block" htmlFor="login-phone">
            <span className="text-sm font-medium text-slate-200">Phone number</span>
            <input
              autoComplete="tel"
              className={fieldClassName}
              id="login-phone"
              inputMode="tel"
              name="phone"
              onChange={(event) => onPhoneChange(event.target.value)}
              required
              type="tel"
              value={state.phone}
            />
          </label>
          {state.error ? (
            <p className="text-sm text-red-300" role="alert">
              {state.error}
            </p>
          ) : null}
          <button className={submitClassName} disabled={pending} type="submit">
            {pending ? "Sending code..." : "Send code"}
          </button>
        </form>
      ) : (
        <form className="space-y-4" onSubmit={onCodeSubmit}>
          <p className="text-sm text-slate-300">
            Enter the verification code sent to <span className="text-white">{state.phone}</span>.
          </p>
          <label className="block" htmlFor="login-code">
            <span className="text-sm font-medium text-slate-200">Verification code</span>
            <input
              autoComplete="one-time-code"
              className={fieldClassName}
              id="login-code"
              inputMode="numeric"
              maxLength={6}
              name="code"
              onChange={(event) => onCodeChange(event.target.value)}
              required
              type="text"
              value={code}
            />
          </label>
          {state.error ? (
            <p className="text-sm text-red-300" role="alert">
              {state.error}
            </p>
          ) : null}
          <button className={submitClassName} disabled={pending} type="submit">
            {pending ? "Verifying..." : "Verify code"}
          </button>
        </form>
      )}
    </section>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [state, setState] = useState<LoginFormState>(initialLoginFormState);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);

  async function onPhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = state.phone.trim();
    setPending(true);
    try {
      const result = await submitLoginPhone(phone);
      setState((current) => loginFormAfterPhone(current, phone, result));
      if (result.ok) {
        setCode("");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setState((current) => loginFormAfterPhone(current, phone, { ok: false, error: message }));
    } finally {
      setPending(false);
    }
  }

  async function onCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = code.trim();
    setPending(true);
    try {
      const result = await completeLoginCode({
        phone: state.phone,
        code: submitted,
        redirectTo: (path) => {
          router.push(path);
          router.refresh();
        },
      });
      if (!result.ok) {
        setState((current) => loginFormAfterCode(current, result));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setState((current) => loginFormAfterCode(current, { ok: false, error: message }));
    } finally {
      setPending(false);
    }
  }

  return (
    <LoginFormFields
      code={code}
      onCodeChange={setCode}
      onCodeSubmit={(event) => void onCodeSubmit(event)}
      onPhoneChange={(phone) => setState((current) => ({ ...current, phone }))}
      onPhoneSubmit={(event) => void onPhoneSubmit(event)}
      pending={pending}
      state={state}
    />
  );
}
