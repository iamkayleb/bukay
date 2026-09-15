/**
 * Public booking phone helpers. Nigerian mobiles normalize to E.164 (+234).
 */

export {
  InvalidPhoneNumberError,
  normalizeNigerianPhone,
  tryNormalizeNigerianPhone,
} from "@/app/lib/auth/phone";

import { normalizeNigerianPhone, tryNormalizeNigerianPhone } from "@/app/lib/auth/phone";

/** Returns true when `input` is a valid Nigerian mobile number. */
export function isValidNigerianPhone(input: string): boolean {
  return tryNormalizeNigerianPhone(input) !== null;
}

/**
 * Validate and normalize a Nigerian phone for public booking.
 * Throws InvalidPhoneNumberError when the number is not a Nigerian mobile.
 */
export function validateNigerianPhone(input: string): string {
  return normalizeNigerianPhone(input);
}
