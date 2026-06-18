import { describe, expect, it, vi } from "vitest";
import { SmsProviderError } from "@/app/auth/sms-provider";
import { createTermiiSmsProviderFromEnv, TermiiSmsProvider } from "@/app/auth/termii-sms-provider";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
}

describe("TermiiSmsProvider", () => {
  it("sends SMS messages through Termii using the transactional route by default", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "ok",
        message_id: "provider-message-id",
      })
    );
    const provider = new TermiiSmsProvider({
      apiKey: "test-api-key",
      senderId: "Bukay",
      baseUrl: "https://termii.example.test/",
      fetchImpl,
    });

    const receipt = await provider.sendSms({
      to: "+2348012345678",
      body: "Your Bukay code is 123456",
    });

    expect(receipt).toEqual({
      provider: "termii",
      messageId: "provider-message-id",
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://termii.example.test/api/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: "test-api-key",
        to: "2348012345678",
        from: "Bukay",
        sms: "Your Bukay code is 123456",
        type: "plain",
        channel: "dnd",
      }),
    });
  });

  it("allows the Termii route to be configured from the environment", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ code: "ok" }));
    const provider = createTermiiSmsProviderFromEnv(
      {
        TERMII_API_KEY: "test-api-key",
        TERMII_SENDER_ID: "Bukay",
        TERMII_CHANNEL: "generic",
      },
      fetchImpl
    );

    await provider.sendSms({
      to: "2348012345678",
      body: "Your Bukay code is 123456",
    });

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(request.channel).toBe("generic");
  });

  it("rejects missing Termii configuration", () => {
    expect(() =>
      createTermiiSmsProviderFromEnv({
        TERMII_API_KEY: "",
        TERMII_SENDER_ID: "Bukay",
      })
    ).toThrowError("Termii API key is required");
  });

  it("rejects unsupported Termii channels", () => {
    expect(() =>
      createTermiiSmsProviderFromEnv({
        TERMII_API_KEY: "test-api-key",
        TERMII_SENDER_ID: "Bukay",
        TERMII_CHANNEL: "email",
      })
    ).toThrowError("Unsupported Termii channel: email");
  });

  it("raises provider errors for failed HTTP responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          message: "Insufficient balance",
        },
        { status: 402 }
      )
    );
    const provider = new TermiiSmsProvider({
      apiKey: "test-api-key",
      senderId: "Bukay",
      fetchImpl,
    });

    await expect(
      provider.sendSms({
        to: "+2348012345678",
        body: "Your Bukay code is 123456",
      })
    ).rejects.toMatchObject({
      name: "SmsProviderError",
      provider: "termii",
      status: 402,
      message: "Insufficient balance",
    } satisfies Partial<SmsProviderError>);
  });

  it("raises provider errors when Termii returns a non-ok provider code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        code: "failed",
        message: "Invalid sender ID",
      })
    );
    const provider = new TermiiSmsProvider({
      apiKey: "test-api-key",
      senderId: "Bukay",
      fetchImpl,
    });

    await expect(
      provider.sendSms({
        to: "+2348012345678",
        body: "Your Bukay code is 123456",
      })
    ).rejects.toMatchObject({
      name: "SmsProviderError",
      provider: "termii",
      status: 200,
      message: "Invalid sender ID",
    } satisfies Partial<SmsProviderError>);
  });
});
