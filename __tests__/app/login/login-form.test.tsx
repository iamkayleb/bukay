import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PATH,
  INITIAL_LOGIN_STATE,
  LoginFormView,
  submitCode,
  submitPhone,
} from "@/app/login/login-form";

function fakeFetch(body: unknown) {
  return vi.fn().mockResolvedValue({ json: async () => body });
}

describe("LoginForm", () => {
  it("renders a phone input and a submit control initially", () => {
    const html = renderToStaticMarkup(<LoginFormView state={INITIAL_LOGIN_STATE} />);
    expect(html).toContain('name="phone"');
    expect(html).toContain('type="submit"');
  });

  it("advances to the code step and redirects after a valid code", async () => {
    const loginFetch = fakeFetch({ ok: true, phone: "+2348012345678" });
    const afterPhone = await submitPhone(INITIAL_LOGIN_STATE, "08012345678", loginFetch);
    expect(loginFetch).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ phone: "08012345678" }) })
    );
    expect(afterPhone.step).toBe("code");
    expect(renderToStaticMarkup(<LoginFormView state={afterPhone} />)).toContain('name="code"');

    const verifyFetch = fakeFetch({ ok: true });
    const done = await submitCode(afterPhone, "123456", verifyFetch);
    expect(verifyFetch).toHaveBeenCalledWith(
      "/api/auth/verify",
      expect.objectContaining({
        body: JSON.stringify({ phone: "+2348012345678", code: "123456" }),
      })
    );
    expect(done.redirectTo).toBe(DASHBOARD_PATH);
  });

  it("surfaces the server error when the phone is rejected", async () => {
    const state = await submitPhone(
      INITIAL_LOGIN_STATE,
      "1",
      fakeFetch({ ok: false, error: "invalid_phone" })
    );
    expect(state.step).toBe("phone");
    expect(renderToStaticMarkup(<LoginFormView state={state} />)).toContain("invalid_phone");
  });

  it("stays on the code step and shows a message for a rejected code", async () => {
    const codeStep = { ...INITIAL_LOGIN_STATE, step: "code" as const, phone: "+2348012345678" };
    const state = await submitCode(codeStep, "000000", fakeFetch({ ok: false, error: "mismatch" }));
    expect(state.step).toBe("code");
    expect(state.redirectTo).toBeNull();
    const html = renderToStaticMarkup(<LoginFormView state={state} />);
    expect(html).toContain('name="code"');
    expect(html).toContain("mismatch");
  });
});
