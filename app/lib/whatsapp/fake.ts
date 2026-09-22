import {
  WhatsAppProvider,
  WhatsAppSendInput,
  WhatsAppSendResult,
  assertWhatsAppSendInput,
} from "./provider";

export type RecordedWhatsAppMessage = WhatsAppSendInput & {
  id: string;
  httpStatus: number;
  sentAt: Date;
};

/**
 * In-memory WhatsAppProvider for tests and local CI.
 * Live Meta credentials are never required; sandbox sends return HTTP 200.
 */
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly name = "fake";
  readonly outbox: RecordedWhatsAppMessage[] = [];
  private counter = 0;
  /** Override to simulate upstream failures (e.g. 500). */
  nextHttpStatus = 200;
  /** When set, the next send throws this error instead of recording. */
  nextError: Error | null = null;

  async send(input: WhatsAppSendInput): Promise<WhatsAppSendResult> {
    assertWhatsAppSendInput(this.name, input);

    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }

    this.counter += 1;
    const id = `wamid.fake_${this.counter}`;
    const httpStatus = this.nextHttpStatus;
    this.nextHttpStatus = 200;
    this.outbox.push({
      ...input,
      content: structuredClone(input.content),
      id,
      httpStatus,
      sentAt: new Date(),
    });

    return {
      provider: this.name,
      id,
      to: input.to,
      httpStatus,
    };
  }

  reset(): void {
    this.outbox.length = 0;
    this.counter = 0;
    this.nextHttpStatus = 200;
    this.nextError = null;
  }

  lastTo(to: string): RecordedWhatsAppMessage | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      if (this.outbox[i].to === to) return this.outbox[i];
    }
    return undefined;
  }
}
