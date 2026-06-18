import crypto from "node:crypto";
import { SmsProvider, SmsProviderError } from "@/app/auth/sms-provider";
import { createTermiiSmsProviderFromEnv } from "@/app/auth/termii-sms-provider";
import { normalizeNigerianPhoneNumber } from "@/app/auth/phone-number";

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_LOGIN_REQUESTS = 3;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

interface OtpRecord {
  phone: string;
  codeHash: string;
  expiresAt: number;
  used: boolean;
  attempts: number;
}

interface LoginRateRecord {
  count: number;
  resetAt: number;
}

interface PhoneAuthDependencies {
  smsProvider?: SmsProvider;
  generateOtp?: () => string;
  now?: () => Date;
}

export class PhoneAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "PhoneAuthError";
  }
}

const otpRecords = new Map<string, OtpRecord>();
const loginRates = new Map<string, LoginRateRecord>();
let dependencies: PhoneAuthDependencies = {};

export function setPhoneAuthDependenciesForTests(nextDependencies: PhoneAuthDependencies): void {
  dependencies = nextDependencies;
}

export function resetPhoneAuthStateForTests(): void {
  dependencies = {};
  otpRecords.clear();
  loginRates.clear();
}

export async function requestLoginOtp(
  rawPhone: unknown
): Promise<{ phone: string; expiresAt: string }> {
  const phone = normalizeNigerianPhoneNumber(rawPhone);
  const now = currentTime();

  assertLoginRateLimit(phone, now);

  const otp = generateOtp();
  const expiresAt = now.getTime() + OTP_TTL_MS;
  otpRecords.set(phone, {
    phone,
    codeHash: hashOtp(phone, otp),
    expiresAt,
    used: false,
    attempts: 0,
  });

  try {
    await smsProvider().sendSms({
      to: phone,
      body: `Your Bukay verification code is ${otp}. It expires in 5 minutes.`,
    });
  } catch (error) {
    otpRecords.delete(phone);
    if (error instanceof SmsProviderError) {
      throw new PhoneAuthError("Could not send verification code", 502, "sms_delivery_failed");
    }
    throw error;
  }

  return { phone, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifyLoginOtp(rawPhone: unknown, rawCode: unknown): { phone: string } {
  const phone = normalizeNigerianPhoneNumber(rawPhone);
  const code = normalizeOtp(rawCode);
  const record = otpRecords.get(phone);
  const now = currentTime().getTime();

  if (!record || record.used || record.expiresAt <= now) {
    throw new PhoneAuthError("Invalid or expired verification code", 401, "invalid_otp");
  }

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    throw new PhoneAuthError("Too many verification attempts", 429, "too_many_attempts");
  }

  record.attempts += 1;
  if (record.codeHash !== hashOtp(phone, code)) {
    throw new PhoneAuthError("Invalid or expired verification code", 401, "invalid_otp");
  }

  record.used = true;
  return { phone };
}

function assertLoginRateLimit(phone: string, now: Date): void {
  const current = loginRates.get(phone);
  if (!current || current.resetAt <= now.getTime()) {
    loginRates.set(phone, { count: 1, resetAt: now.getTime() + LOGIN_WINDOW_MS });
    return;
  }

  if (current.count >= MAX_LOGIN_REQUESTS) {
    throw new PhoneAuthError("Too many verification code requests", 429, "rate_limited");
  }

  current.count += 1;
}

function normalizeOtp(input: unknown): string {
  if (typeof input !== "string" || !/^\d{6}$/.test(input.trim())) {
    throw new PhoneAuthError("Enter a valid verification code", 400, "invalid_otp_format");
  }

  return input.trim();
}

function generateOtp(): string {
  return dependencies.generateOtp?.() ?? crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function currentTime(): Date {
  return dependencies.now?.() ?? new Date();
}

function smsProvider(): SmsProvider {
  return dependencies.smsProvider ?? createTermiiSmsProviderFromEnv();
}

function hashOtp(phone: string, otp: string): string {
  const secret = process.env.OTP_SECRET?.trim() || "bukay-local-development-otp-secret";
  return crypto.createHmac("sha256", secret).update(`${phone}:${otp}`).digest("hex");
}
