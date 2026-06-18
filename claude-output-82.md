# PR #82 progress — phone OTP auth

## Completed this round

- [x] **Add SmsProvider interface + Termii adapter**
  - `app/lib/sms/provider.ts` — `SmsProvider` port + `SmsMessage` / `SmsSendResult` types + `SmsProviderError`
  - `app/lib/sms/termii.ts` — `TermiiProvider` adapter (POSTs to `/api/sms/send`, configurable base URL/channel, injectable `fetch` for tests, `termiiFromEnv()` helper)
  - `app/lib/sms/memory.ts` — `MemorySmsProvider` for tests/dev with an inspectable outbox
  - `app/lib/sms/index.ts` — barrel re-export
  - `__tests__/app/lib/sms/termii.test.ts` (7 tests) — credential handling, payload shape, error mapping, network failure, missing message_id, input validation, trailing-slash normalization
  - `__tests__/app/lib/sms/memory.test.ts` (3 tests) — recording, lookup, reset

Verification: `npx vitest run __tests__/app/lib/sms` → 10/10 pass; full suite 60/60.

## Remaining tasks

- [ ] Build /login and /verify routes
- [ ] Implement OTP generation, storage, expiry (5 min), rate limit
- [ ] Normalize +234 phone numbers
- [ ] Session cookie with rolling expiry
- [ ] E2E tests: signup, login, logout
