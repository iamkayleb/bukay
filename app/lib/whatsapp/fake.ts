import {
  WhatsAppProvider,
  WhatsAppProviderError,
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
} from "./provider";
import { getTemplate, renderTemplateParams } from "./templates";

export type RecordedWhatsApp = WhatsAppTemplateMessage & {
  id: string;
  sentAt: Date;
};

/** In-memory test double. Applies the same validation as the live adapter. */
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly name = "fake";
  readonly outbox: RecordedWhatsApp[] = [];
  private counter = 0;

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    if (!message.to) throw new WhatsAppProviderError(this.name, "WhatsApp 'to' is required");
    const template = getTemplate(message.template);
    if (!template) {
      throw new WhatsAppProviderError(this.name, `Unknown template '${message.template}'`);
    }
    try {
      renderTemplateParams(template, message.params);
    } catch (err) {
      throw new WhatsAppProviderError(this.name, (err as Error).message, { cause: err });
    }
    this.counter += 1;
    const id = `fake-wa-${this.counter}`;
    this.outbox.push({ ...message, id, sentAt: new Date() });
    return { id, provider: this.name, to: message.to, status: 200 };
  }

  reset(): void {
    this.outbox.length = 0;
    this.counter = 0;
  }

  lastTo(to: string): RecordedWhatsApp | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      if (this.outbox[i].to === to) return this.outbox[i];
    }
    return undefined;
  }
}
