import {
  type SendWhatsAppTemplateInput,
  type WhatsAppProvider,
  WhatsAppProviderError,
  type WhatsAppSendResult,
} from "./provider";

/** A message accepted by the in-memory provider during a test. */
export type RecordedWhatsAppTemplate = SendWhatsAppTemplateInput & {
  id: string;
  sentAt: Date;
};

/**
 * In-memory WhatsApp provider for tests and local development.
 *
 * It follows the port instead of imitating Meta response objects, allowing
 * callers to replace the live adapter without changing their dependencies.
 */
export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly name = "fake";
  readonly outbox: RecordedWhatsAppTemplate[] = [];
  private counter = 0;

  async sendTemplate(input: SendWhatsAppTemplateInput): Promise<WhatsAppSendResult> {
    if (!input.to) throw new WhatsAppProviderError(this.name, "WhatsApp 'to' is required");
    if (!input.template) {
      throw new WhatsAppProviderError(this.name, "WhatsApp template name is required");
    }

    this.counter += 1;
    const id = `fake-wa-${this.counter}`;
    this.outbox.push({ ...input, parameters: [...input.parameters], id, sentAt: new Date() });
    return { id, provider: this.name, to: input.to };
  }

  reset(): void {
    this.outbox.length = 0;
    this.counter = 0;
  }

  lastTo(to: string): RecordedWhatsAppTemplate | undefined {
    for (let index = this.outbox.length - 1; index >= 0; index -= 1) {
      if (this.outbox[index].to === to) return this.outbox[index];
    }
    return undefined;
  }
}
