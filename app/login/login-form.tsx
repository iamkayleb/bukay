"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Stage = "phone" | "code";

const ERROR_MESSAGES: Record<string, string> = {
  phone_required: "Enter your phone number.",
  invalid_phone: "That doesn't look like a valid Nigerian phone number.",
  invalid_json: "Something went wrong. Please try again.",
  sms_send_failed: "We couldn't send the code. Please try again shortly.",
  phone_and_code_required: "Enter both your phone number and the code.",
  invalid_code_format: "The code must be six digits.",
  mismatch: "That code isn't right. Please check and try again.",
  not_found: "No code was requested. Please start over.",
  expired: "The code has expired. Request a new one.",
  rate_limited: "Too many attempts. Please wait before trying again.",
};

function messageFor(code: string | undefined): string {
  if (!code) return "Something went wrong. Please try again.";
  return ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(messageFor(data.error));
        return;
      }
      setStage("code");
      setInfo("We've sent a six-digit code to your phone.");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(messageFor(data.error));
        return;
      }
      router.push("/today");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "code") {
    return (
      <form
        aria-describedby={error ? "login-form-error" : undefined}
        className="flex flex-col gap-4"
        onSubmit={(event) => void handleVerifyCode(event)}
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-200" htmlFor="login-code">
            Verification code
          </label>
          <input
            aria-label="Six-digit verification code"
            autoComplete="one-time-code"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-emerald-400"
            id="login-code"
            inputMode="numeric"
            maxLength={6}
            minLength={6}
            name="code"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            pattern="\d{6}"
            placeholder="123456"
            required
            value={code}
          />
        </div>
        {info ? (
          <p className="text-xs text-emerald-300" role="status">
            {info}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-red-400" id="login-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <button
            className="flex-1 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting || code.length !== 6}
            type="submit"
          >
            {submitting ? "Verifying..." : "Verify and sign in"}
          </button>
          <button
            className="rounded-md border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-500"
            disabled={submitting}
            onClick={() => {
              setStage("phone");
              setCode("");
              setError(null);
              setInfo(null);
            }}
            type="button"
          >
            Change phone
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      aria-describedby={error ? "login-form-error" : undefined}
      className="flex flex-col gap-4"
      onSubmit={(event) => void handleRequestCode(event)}
    >
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-200" htmlFor="login-phone">
          Phone number
        </label>
        <input
          aria-label="Nigerian phone number"
          autoComplete="tel"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-emerald-400"
          id="login-phone"
          inputMode="tel"
          name="phone"
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+2348012345678"
          required
          type="tel"
          value={phone}
        />
      </div>
      {error ? (
        <p className="text-sm text-red-400" id="login-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={submitting || phone.trim().length === 0}
        type="submit"
      >
        {submitting ? "Sending..." : "Send verification code"}
      </button>
    </form>
  );
}
