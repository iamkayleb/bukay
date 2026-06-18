import { SmsMessage, SmsProvider, SmsSendResult } from "./provider";

export type RecordedSms = SmsMessage & {
  id: string;
  sentAt: Date;
};

export class MemorySmsProvider implements SmsProvider {
  readonly name = "memory";
  readonly outbox: RecordedSms[] = [];
  private counter = 0;

  async send(message: SmsMessage): Promise<SmsSendResult> {
    this.counter += 1;
    const id = `mem-${this.counter}`;
    this.outbox.push({ ...message, id, sentAt: new Date() });
    return { id, provider: this.name, to: message.to };
  }

  reset(): void {
    this.outbox.length = 0;
    this.counter = 0;
  }

  lastTo(to: string): RecordedSms | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      if (this.outbox[i].to === to) return this.outbox[i];
    }
    return undefined;
  }
}
