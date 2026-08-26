export type { EmailMessage, EmailProvider, EmailSendResult } from "./provider";
export { EmailProviderError } from "./provider";
export { NoopEmailProvider } from "./noop";
export type { RecordedEmail } from "./noop";
export {
  getEmailProvider,
  setEmailProviderForTests,
  __resetEmailProviderForTests,
} from "./from-env";
