export type { EmailMessage, EmailProvider, EmailSendResult } from "./provider";
export { EmailProviderError } from "./provider";
export { NoopEmailProvider } from "./noop";
export type { RecordedEmail } from "./noop";
export {
  getEmailProvider,
  setEmailProviderForTests,
  __resetEmailProviderForTests,
} from "./from-env";
export {
  renderBookingConfirmedTemplate,
  renderBookingRescheduledTemplate,
  renderBookingCancelledTemplate,
} from "./templates";
export type { BookingEmailContext, RenderedBookingEmail } from "./templates";
export { sendBookingNotification } from "./send-booking-notification";
export type {
  BookingNotificationKind,
  BookingNotificationOutcome,
  BookingNotificationResult,
  AuditLogWriter,
} from "./send-booking-notification";
