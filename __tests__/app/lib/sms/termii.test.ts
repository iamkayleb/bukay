import { describe, it, expect, vi } from "vitest";
import { TermiiProvider } from "@/app/lib/sms/termii";
import { SmsProviderError } from "@/app/lib/sms/provider";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("TermiiProvider", () => {
  it("requires apiKey and senderId", () => {
    expect(() => new TermiiProvider({ apiKey: "", senderId: "x" })).toThrow(/apiKey/);
    expect(() => new TermiiProvider({ apiKey: "x", senderId: "" })).toThrow(/senderId/);
  });

  it("POSTs to /api/sms/send with credentials and returns the provider id", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ message_id: "abc123" })
    );
    const provider = new TermiiProvider({
      apiKey: "key",
      senderId: "Bukay",
      baseUrl: "https://api.example.com",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.send({ to: "+2348012345678", body: "hi" });

    expect(result).toEqual({ id: "abc123", provider: "termii", to: "+2348012345678" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/sms/send");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      to: "+2348012345678",
      from: "Bukay",
      sms: "hi",
      api_key: "key",
      type: "plain",
      channel: "generic",
    });
  });

  it("strips trailing slashes from baseUrl", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ message_id: "x" })
    );
    const provider = new TermiiProvider({
      apiKey: "k",
      senderId: "S",
      baseUrl: "https://api.example.com/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.send({ to: "+234800", body: "hi" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://api.example.com/api/sms/send");
  });

  it("throws SmsProviderError on non-OK response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "bad number" }, { status: 422 }));
    const provider = new TermiiProvider({
      apiKey: "k",
      senderId: "S",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.send({ to: "+234", body: "hi" })).rejects.toMatchObject({
      name: "SmsProviderError",
      message: "bad number",
      status: 422,
    });
  });

  it("wraps network errors as SmsProviderError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const provider = new TermiiProvider({
      apiKey: "k",
      senderId: "S",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.send({ to: "+234", body: "hi" })).rejects.toBeInstanceOf(
      SmsProviderError
    );
  });

  it("throws if Termii omits a message_id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const provider = new TermiiProvider({
      apiKey: "k",
      senderId: "S",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.send({ to: "+234", body: "hi" })).rejects.toThrow(/message_id/);
  });

  it("validates message inputs", async () => {
    const fetchImpl = vi.fn();
    const provider = new TermiiProvider({
      apiKey: "k",
      senderId: "S",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(provider.send({ to: "", body: "hi" })).rejects.toThrow(/'to'/);
    await expect(provider.send({ to: "+234", body: "" })).rejects.toThrow(/'body'/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
