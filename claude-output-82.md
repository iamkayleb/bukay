# Issue #82 — Phone + OTP authentication

## Tasks completed this round

- [x] Add SmsProvider interface + Termii adapter (prior)
- [x] Build /login and /verify routes
- [x] Implement OTP generation, storage, expiry (5 min), rate limit
- [x] Normalize +234 phone numbers
- [x] Session cookie with rolling expiry
- [x] E2E tests: signup, login, logout

## Acceptance criteria status

- [x] User can sign up and log in by phone + OTP (auth-flow.test.ts → "signs up + logs in")
- [x] Expired/used OTP rejected (otp.test.ts "rejects an expired code"; auth-flow.test.ts "rejects a used OTP")
- [x] Rate limit blocks brute force (otp.test.ts "rate-limits issue calls"; auth-flow.test.ts "rate-limits brute-force OTP requests")
- [x] Session persists across reloads (auth-flow.test.ts double `/me` call with same cookie)

## Files

- `app/lib/auth/phone.ts` — E.164 normalizer for Nigerian (+234) numbers
- `app/lib/auth/otp.ts` — 6-digit OTP store with sha256 hashing, 5-min TTL,
  per-phone resend cooldown, verify-attempt cap, and per-window rate limit
- `app/lib/auth/session.ts` — HMAC-signed session token, HttpOnly+SameSite=Lax
  cookie builder, rolling refresh via `signSession`
- `app/lib/auth/sms.ts` — singleton resolver: Termii in prod (`SMS_PROVIDER=termii`),
  in-memory otherwise; test override hooks
- `app/api/auth/login/route.ts` — `POST { phone }` → normalize, issue OTP, send SMS
- `app/api/auth/verify/route.ts` — `POST { phone, code }` → verify, set session cookie
- `app/api/auth/logout/route.ts` — clears the session cookie
- `app/api/auth/me/route.ts` — returns session info and refreshes the cookie (rolling expiry)
- Tests: `__tests__/app/lib/auth/{phone,otp,session}.test.ts`,
  `__tests__/app/api/auth/auth-flow.test.ts`

## Verification

`npx vitest run` — **95 tests pass** across 14 files. 35 of those are new.

## Notes / follow-ups

- The current "user" is a synthetic `user:+234...` id; persistence to the Prisma
  `User`/`Client` model can be layered on once the multi-tenant signup story is
  finalized (the `User` model in `prisma/schema.prisma` is currently
  duplicated — that pre-existing schema bug is out of scope here).
- Rate-limit and OTP storage are in-process. For multi-instance deployment,
  swap `OtpStore` for a Redis-backed implementation behind the same interface.
