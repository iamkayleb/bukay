import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import LoginPage from "@/app/login/page";
import {
  LOGIN_REDIRECT_PATH,
  LoginFormFields,
  completeLoginCode,
  initialLoginFormState,
  loginFormAfterCode,
  loginFormAfterPhone,
  submitLoginPhone,
  type LoginFormState,
} from "@/app/login/login-form";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderFields(state: LoginFormState) {
  return renderToStaticMarkup(
    <LoginFormFields
      code=""
      onCodeChange={() => {}}
      onCodeSubmit={(event) => event.preventDefault()}
      onPhoneChange={() => {}}
      onPhoneSubmit={(event) => event.preventDefault()}
      pending={false}
      state={state}
    />
  );
}

describe("login page", () => {
  it("renders a phone input and a submit control", () => {
    const html = renderToStaticMarkup(<LoginPage />);

    expect(html).toContain('type="tel"');
    expect(html).toContain('name="phone"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Send code");
    expect(html).not.toContain("/api/auth/login");
  });
});

describe("login form", () => {
  it("posts a valid phone and advances to the code step", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/auth/login");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ phone: "08031234567" });
      return jsonResponse({ ok: true, phone: "+2348031234567" }, 200);
    });

    const result = await submitLoginPhone("08031234567", fetcher);
    const next = loginFormAfterPhone(initialLoginFormState, "08031234567", result);
    const html = renderFields(next);

    expect(result).toEqual({ ok: true });
    expect(next.step).toBe("code");
    expect(next.error).toBeNull();
    expect(html).toContain("Verification code");
    expect(html).toContain("08031234567");
    expect(html).toContain('name="code"');
    expect(html).not.toContain('type="tel"');
  });

  it("surfaces the server error text when the phone is rejected", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: false, error: "invalid_phone" }, 400));

    const result = await submitLoginPhone("not-a-phone", fetcher);
    const next = loginFormAfterPhone(initialLoginFormState, "not-a-phone", result);
    const html = renderFields(next);

    expect(result).toEqual({ ok: false, error: "invalid_phone" });
    expect(next.step).toBe("phone");
    expect(html).toContain("invalid_phone");
    expect(html).toContain('type="tel"');
  });

  it("posts the code and redirects on success", async () => {
    const redirectTo = vi.fn();
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("/api/auth/verify");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        phone: "08031234567",
        code: "123456",
      });
      return jsonResponse({ ok: true, userId: "user:+2348031234567" }, 200);
    });

    const result = await completeLoginCode({
      phone: "08031234567",
      code: "123456",
      fetcher,
      redirectTo,
    });

    expect(result).toEqual({ ok: true });
    expect(redirectTo).toHaveBeenCalledWith(LOGIN_REDIRECT_PATH);
  });

  it("leaves a rejected code on the code step and shows the server message", async () => {
    const redirectTo = vi.fn();
    const fetcher = vi.fn(async () => jsonResponse({ ok: false, error: "mismatch" }, 401));
    const codeStep: LoginFormState = {
      step: "code",
      phone: "08031234567",
      error: null,
    };

    const result = await completeLoginCode({
      phone: codeStep.phone,
      code: "000000",
      fetcher,
      redirectTo,
    });
    const next = loginFormAfterCode(codeStep, result);
    const html = renderFields(next);

    expect(result).toEqual({ ok: false, error: "mismatch" });
    expect(redirectTo).not.toHaveBeenCalled();
    expect(next.step).toBe("code");
    expect(html).toContain("mismatch");
    expect(html).toContain("Verification code");
    expect(html).toContain('name="code"');
    expect(html).not.toContain('type="tel"');
  });
});
