# WhatsApp Templates

Business-initiated WhatsApp messages must use a template that Meta has approved.
The registry lives in `app/lib/whatsapp/templates.ts`; every template there is
listed below. Keep both in sync.

## Approval steps

1. Open WhatsApp Manager in Meta Business Suite for the business account.
2. Go to **Message templates** → **Create template**.
3. Pick the category listed below, set the name exactly as in the registry, and
   language `en`.
4. Enter the body text using positional variables (`{{1}}`, `{{2}}`, …) in the
   order of the params column, and supply a sample value for each.
5. Submit for review. Approval usually takes minutes to 24 hours. Rejected
   templates must be edited and resubmitted under the same name.
6. Once the status is **Approved**, the template can be sent by the live adapter.

Approval and a live business number are human prerequisites. Tests use
`FakeWhatsAppProvider` and never call Meta.

## Templates

| Name                   | Category       | Language | Params (in order)                                     | Purpose                                      |
| ---------------------- | -------------- | -------- | ----------------------------------------------------- | -------------------------------------------- |
| `booking_confirmation` | UTILITY        | en       | `customerName`, `serviceName`, `startsAt`, `businessName` | Sent to a customer once a booking is confirmed. |
| `booking_reminder`     | UTILITY        | en       | `customerName`, `serviceName`, `startsAt`             | Reminder sent ahead of an upcoming appointment. |
| `booking_cancellation` | UTILITY        | en       | `customerName`, `serviceName`, `businessName`         | Sent when a booking is cancelled.            |
| `greeting`             | UTILITY        | en       | `businessName`                                        | Sent to an unrecognised sender who messages a business number. |
| `otp_code`             | AUTHENTICATION | en       | `code`                                                | One-time sign-in code.                       |

## Configuration

The live adapter reads `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`
(optional: `WHATSAPP_BASE_URL`, `WHATSAPP_API_VERSION`).

## Inbound webhook

`POST /api/webhooks/whatsapp` receives inbound messages. It verifies
`x-hub-signature-256` with `WHATSAPP_APP_SECRET`, routes by the business number
(`Tenant.whatsappNumber`, E.164) and records `Conversation`/`Message` rows.
Senders that match no `Client` receive the `greeting` template once; known
clients resume silently. `GET` answers Meta's handshake using
`WHATSAPP_VERIFY_TOKEN`.
