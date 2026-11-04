# WhatsApp message templates

Bukay sends customer notifications through the Meta WhatsApp Cloud API. Every
template in [`app/lib/whatsapp/templates.ts`](../app/lib/whatsapp/templates.ts)
must be approved in Meta Business Manager before live traffic. Local and CI
tests use `FakeWhatsAppProvider` and never call Meta.

## Approval steps

1. Open [Meta Business Suite](https://business.facebook.com/) → **WhatsApp Manager**
   for the Bukay (or tenant) business portfolio.
2. Confirm a WhatsApp Business phone number is connected and in **Connected**
   status. Sandbox / test numbers are fine for development; production needs a
   verified display name and business profile.
3. Go to **Message templates** → **Create template**.
4. Choose category **Utility** for booking lifecycle messages (create, confirm,
   cancel, reschedule, reminder) and the inbound greeting.
5. Set the template **name** exactly as listed below (snake_case). Names are
   immutable after approval.
6. Set language to the code in the registry (default `en`).
7. Paste the body text from the registry, keeping `{{1}}`, `{{2}}`, … placeholders
   in the same order as `bodyPlaceholders`.
8. Submit for review. Meta usually responds within minutes to a few days.
9. When status is **Approved**, store the production credentials as environment
   variables and send through `MetaWhatsAppProvider`:
   - `WHATSAPP_ACCESS_TOKEN` — permanent system-user token with
     `whatsapp_business_messaging`
   - `WHATSAPP_PHONE_NUMBER_ID` — phone number id from WhatsApp Manager
   - Optional: `WHATSAPP_API_VERSION` (default `v21.0`), `WHATSAPP_BASE_URL`
10. Re-submit a new template (new name) if body copy or placeholder order changes;
    Meta does not allow mutating an approved template in place.

## Template catalog

| Key | Meta name | Language | Category | Placeholders | Purpose |
|-----|-----------|----------|----------|--------------|---------|
| `greeting` | `greeting` | `en` | UTILITY | `business_name` | Welcome unknown inbound senders |
| `booking_created` | `booking_created` | `en` | UTILITY | `client_name`, `service_name`, `starts_at`, `business_name` | New booking created |
| `booking_confirmed` | `booking_confirmed` | `en` | UTILITY | `client_name`, `service_name`, `starts_at`, `business_name` | Merchant confirmed booking |
| `booking_cancelled` | `booking_cancelled` | `en` | UTILITY | `client_name`, `service_name`, `starts_at`, `business_name` | Booking cancelled |
| `booking_rescheduled` | `booking_rescheduled` | `en` | UTILITY | `client_name`, `service_name`, `previous_starts_at`, `new_starts_at`, `business_name` | Booking moved |
| `booking_reminder` | `booking_reminder` | `en` | UTILITY | `client_name`, `service_name`, `starts_at`, `business_name` | T-24h / T-2h reminder |

### Body examples (as submitted to Meta)

**greeting**

> Hi! Welcome to {{1}}. Reply with the service you need or tap Book to get started.

**booking_created**

> Hi {{1}}, your booking for {{2}} on {{3}} at {{4}} was created. We will confirm shortly.

**booking_confirmed**

> Hi {{1}}, your {{2}} appointment on {{3}} at {{4}} is confirmed. See you then!

**booking_cancelled**

> Hi {{1}}, your {{2}} appointment on {{3}} at {{4}} has been cancelled.

**booking_rescheduled**

> Hi {{1}}, your {{2}} appointment moved from {{3}} to {{4}} at {{5}}.

**booking_reminder**

> Hi {{1}}, reminder: {{2}} is coming up on {{3}} at {{4}}. Reply STOP to opt out of reminders.

## Testing without Meta

```ts
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import { WHATSAPP_TEMPLATES } from "@/app/lib/whatsapp/templates";

const whatsapp = new FakeWhatsAppProvider();
const greeting = WHATSAPP_TEMPLATES.greeting;

await whatsapp.send({
  to: "+2348012345678",
  content: {
    kind: "template",
    name: greeting.name,
    language: greeting.language,
    bodyParameters: ["Demo Salon"],
  },
});
// result.httpStatus === 200, result.id starts with "wamid.fake_"
```
