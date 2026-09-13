// Nigerian phone validation lives in app/lib/auth/phone.ts (already covered
// by __tests__/app/lib/auth/phone.test.ts). Re-exported here so the public
// booking flow has a stable, feature-scoped import path without duplicating
// the normalization logic.
export {
  InvalidPhoneNumberError,
  normalizeNigerianPhone,
  tryNormalizeNigerianPhone,
} from "@/app/lib/auth/phone";
