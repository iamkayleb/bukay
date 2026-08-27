import { describe, it, expect } from "vitest";
import { NoopEmailProvider } from "@/app/lib/email/noop";

describe("NoopEmailProvider", () => {
  it("records each sent message in order without dispatching anything", async () => {
    const provider = new NoopEmailProvider();
    const a = await provider.send({ to: "a@example.com", subject: "one", html: "<p>one</p>" });
    const b = await provider.send({ to: "b@example.com", subject: "two", html: "<p>two</p>" });

    expect(a.id).toBe("noop-1");
    expect(b.id).toBe("noop-2");
    expect(a.provider).toBe("noop");
    expect(provider.outbox.map((m) => m.subject)).toEqual(["one", "two"]);
  });

  it("returns the most recent message for an address via lastTo", async () => {
    const provider = new NoopEmailProvider();
    await provider.send({ to: "a@example.com", subject: "older", html: "<p>older</p>" });
    await provider.send({ to: "c@example.com", subject: "other", html: "<p>other</p>" });
    await provider.send({ to: "a@example.com", subject: "newer", html: "<p>newer</p>" });

    expect(provider.lastTo("a@example.com")?.subject).toBe("newer");
    expect(provider.lastTo("nobody@example.com")).toBeUndefined();
  });

  it("reset clears the outbox and id counter", async () => {
    const provider = new NoopEmailProvider();
    await provider.send({ to: "a@example.com", subject: "x", html: "<p>x</p>" });
    provider.reset();
    expect(provider.outbox).toHaveLength(0);
    const next = await provider.send({ to: "a@example.com", subject: "y", html: "<p>y</p>" });
    expect(next.id).toBe("noop-1");
  });
});
