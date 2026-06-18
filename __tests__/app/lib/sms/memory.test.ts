import { describe, it, expect } from "vitest";
import { MemorySmsProvider } from "@/app/lib/sms/memory";

describe("MemorySmsProvider", () => {
  it("records each sent message in order", async () => {
    const provider = new MemorySmsProvider();
    const a = await provider.send({ to: "+2348011111111", body: "one" });
    const b = await provider.send({ to: "+2348022222222", body: "two" });

    expect(a.id).toBe("mem-1");
    expect(b.id).toBe("mem-2");
    expect(a.provider).toBe("memory");
    expect(provider.outbox.map((m) => m.body)).toEqual(["one", "two"]);
  });

  it("returns the most recent message for a number via lastTo", async () => {
    const provider = new MemorySmsProvider();
    await provider.send({ to: "+2348000000001", body: "older" });
    await provider.send({ to: "+2348000000002", body: "other" });
    await provider.send({ to: "+2348000000001", body: "newer" });

    expect(provider.lastTo("+2348000000001")?.body).toBe("newer");
    expect(provider.lastTo("+2348099999999")).toBeUndefined();
  });

  it("reset clears the outbox and id counter", async () => {
    const provider = new MemorySmsProvider();
    await provider.send({ to: "+234800", body: "x" });
    provider.reset();
    expect(provider.outbox).toHaveLength(0);
    const next = await provider.send({ to: "+234800", body: "y" });
    expect(next.id).toBe("mem-1");
  });
});
