import { EmailMessage, EmailProvider, EmailSendResult } from "./provider";

export type RecordedEmail = EmailMessage & {
  id: string;
  sentAt: Date;
};

/**
 * Dev/no-op driver: records attempted sends without dispatching any real
 * email. Used as the default so local dev and tests never depend on an
 * outbound email provider being configured.
 */
export class NoopEmailProvider implements EmailProvider {
  readonly name = "noop";
  readonly outbox: RecordedEmail[] = [];
  private counter = 0;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.counter += 1;
    const id = `noop-${this.counter}`;
    this.outbox.push({ ...message, id, sentAt: new Date() });
    return { id, provider: this.name, to: message.to };
  }

  reset(): void {
    this.outbox.length = 0;
    this.counter = 0;
  }

  lastTo(to: string): RecordedEmail | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      if (this.outbox[i].to === to) return this.outbox[i];
    }
    return undefined;
  }
}
