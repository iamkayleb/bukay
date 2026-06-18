export class PhoneNumberError extends Error {
  constructor(message = "Enter a valid Nigerian phone number") {
    super(message);
    this.name = "PhoneNumberError";
  }
}

export function normalizeNigerianPhoneNumber(input: unknown): string {
  if (typeof input !== "string") {
    throw new PhoneNumberError();
  }

  const compact = input.trim().replace(/[\s().-]/g, "");
  if (!compact) {
    throw new PhoneNumberError();
  }

  let nationalNumber: string;
  if (compact.startsWith("+234")) {
    nationalNumber = compact.slice(4);
  } else if (compact.startsWith("234")) {
    nationalNumber = compact.slice(3);
  } else if (compact.startsWith("0")) {
    nationalNumber = compact.slice(1);
  } else {
    nationalNumber = compact;
  }

  if (!/^[789]\d{9}$/.test(nationalNumber)) {
    throw new PhoneNumberError();
  }

  return `+234${nationalNumber}`;
}
