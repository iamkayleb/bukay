<!-- base-branch: eval/cursor -->
<!-- eval-round: 2 -->
<!-- eval-spec: auth-otp -->
<!-- eval-agent: cursor -->

## Why

Phone-first login matches how the target market signs in, and every owner surface sits behind it.

## Scope

Implement phone authentication with OTP through an SMS provider port. Normalize Nigerian numbers to E.164. Use signed HTTP-only session cookies.

## Non-Goals

Use the fake SMS adapter in tests. Live Termii credentials must not be required for CI.

## Tasks

- [ ] Add `lib/sms/provider.ts`: define the `SmsProvider` interface
- [ ] Add `lib/sms/termii.ts`: add the Termii adapter and a fake in `lib/sms/fake.ts`
- [ ] Add `app/(auth)/login/page.tsx`: build  and `app/(auth)/verify/page.tsx`
- [ ] Add `lib/otp.ts`: implement OTP issue, 5-minute expiry and rate limiting
- [ ] Add `lib/phone.ts`: normalize `+234` numbers
- [ ] Add `tests/auth.test.ts` covering signup, login and logout

## Acceptance Criteria

- [ ] A user completes signup and login by phone and OTP, verified by `pnpm test`
- [ ] An expired or reused OTP is rejected with HTTP 401
- [ ] Rate limiting blocks repeated attempts
- [ ] `pnpm test` passes
