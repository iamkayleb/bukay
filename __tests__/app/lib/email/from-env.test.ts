import { afterEach, describe, it, expect } from "vitest";
import {
  __resetEmailProviderForTests,
  getEmailProvider,
  setEmailProviderForTests,
} from "@/app/lib/email/from-env";
import { NoopEmailProvider } from "@/app/lib/email/noop";

afterEach(() => {
  __resetEmailProviderForTests();
});

describe("getEmailProvider", () => {
  it("defaults to the no-op driver", () => {
    const provider = getEmailProvider();
    expect(provider).toBeInstanceOf(NoopEmailProvider);
    expect(provider.name).toBe("noop");
  });

  it("memoizes the resolved provider across calls", () => {
    const first = getEmailProvider();
    const second = getEmailProvider();
    expect(first).toBe(second);
  });

  it("allows tests to substitute a provider", () => {
    const fake = new NoopEmailProvider();
    setEmailProviderForTests(fake);
    expect(getEmailProvider()).toBe(fake);
  });

  it("resets back to a fresh default provider", () => {
    const fake = new NoopEmailProvider();
    setEmailProviderForTests(fake);
    __resetEmailProviderForTests();
    expect(getEmailProvider()).not.toBe(fake);
  });
});
