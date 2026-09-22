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
 *
 * Live Meta credentials are never required. Successful sandbox sends return
 * HTTP 200 with a synthetic `wamid.fake_*` message id, matching the Meta
 * adapter's success shape so callers can be exercised without Graph API I/O.
 *
 * Unlike MetaWhatsAppProvider (which throws on non-OK upstream responses),
 * `nextHttpStatus` lets tests assert on a non-200 result without throwing.
 * Use `nextError` when the caller path under test must observe a thrown
 * WhatsAppProviderError.
 */
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly name = "fake";
  readonly outbox: RecordedWhatsAppMessage[] = [];
  private counter = 0;
  /**
   * One-shot HTTP status for the next successful (non-throwing) send.
   * Resets to 200 after each send. Prefer `nextError` to simulate throws.
   */
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
    // Clone content so later caller mutations cannot corrupt the outbox.
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

  /** Most recent recorded message for `to`, or undefined. */
  lastTo(to: string): RecordedWhatsAppMessage | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      if (this.outbox[i].to === to) return this.outbox[i];
    }
    return undefined;
  }

  /** All recorded messages for `to`, in send order. */
  messagesTo(to: string): RecordedWhatsAppMessage[] {
    return this.outbox.filter((message) => message.to === to);
  }
}
