# WhatsApp templates

Business-initiated WhatsApp messages must use a template approved in Meta
WhatsApp Manager. The application registry is
`app/lib/whatsapp/templates.ts`; this document lists every entry in it.

## Approval process

1. In Meta Business Suite, open **WhatsApp Manager** for the relevant business
   account and select **Message templates**.
2. Create a template using the exact name, category, language, and body
   placeholder order listed below.
3. Use positional placeholders (`{{1}}`, `{{2}}`, and so on) for the parameters
   in the stated order, and provide sample values when Meta asks for them.
4. Submit the template for review. Do not enable a messaging flow until Meta
   marks its matching template **Approved**.
5. If Meta rejects a template, correct the content in WhatsApp Manager and
   resubmit it. Keep this registry and the table below aligned with the
   approved version.

Local and automated tests use `FakeWhatsAppProvider`; they do not send a
message to Meta or require a business phone number.

## Registered templates

| Name | Category | Language | Parameters (in order) | Purpose |
| --- | --- | --- | --- | --- |
| `welcome` | `UTILITY` | `en_US` | `businessName` | Sent when an unknown sender first messages a business. |
| `booking_confirmation` | `UTILITY` | `en_US` | `customerName`, `serviceName`, `startsAt`, `businessName` | Sent after a customer booking is confirmed. |
| `booking_reminder` | `UTILITY` | `en_US` | `customerName`, `serviceName`, `startsAt` | Sent before an upcoming appointment. |
| `booking_cancellation` | `UTILITY` | `en_US` | `customerName`, `serviceName`, `businessName` | Sent when a booking is cancelled. |
| `otp_code` | `AUTHENTICATION` | `en_US` | `code` | One-time code used to sign in. |
