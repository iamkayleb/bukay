const NIGERIA_CC = "234";

export class InvalidPhoneNumberError extends Error {
  constructor(message = "Invalid phone number") {
    super(message);
    this.name = "InvalidPhoneNumberError";
  }
}

export function normalizeNigerianPhone(input: string): string {
  if (typeof input !== "string") {
    throw new InvalidPhoneNumberError("phone must be a string");
  }

  const trimmed = input.trim();
  if (!trimmed) throw new InvalidPhoneNumberError("phone is required");

  const digits = trimmed.replace(/[\s()\-.]/g, "");
  if (!/^\+?\d+$/.test(digits)) {
    throw new InvalidPhoneNumberError("phone contains non-digit characters");
  }

  let body: string;
  if (digits.startsWith("+")) {
    body = digits.slice(1);
    if (!body.startsWith(NIGERIA_CC)) {
      throw new InvalidPhoneNumberError("only +234 Nigerian numbers are supported");
    }
    body = body.slice(NIGERIA_CC.length);
  } else if (digits.startsWith("00" + NIGERIA_CC)) {
    body = digits.slice(2 + NIGERIA_CC.length);
  } else if (digits.startsWith(NIGERIA_CC)) {
    body = digits.slice(NIGERIA_CC.length);
  } else if (digits.startsWith("0")) {
    body = digits.slice(1);
  } else {
    body = digits;
  }

  if (body.length !== 10) {
    throw new InvalidPhoneNumberError("Nigerian subscriber number must be 10 digits");
  }
  if (!/^[789]/.test(body)) {
    throw new InvalidPhoneNumberError("Nigerian mobile numbers start with 7, 8, or 9");
  }

  return `+${NIGERIA_CC}${body}`;
}

export function tryNormalizeNigerianPhone(input: string): string | null {
  try {
    return normalizeNigerianPhone(input);
  } catch {
    return null;
  }
}
