## Keepalive run summary

Verified: `pnpm build`, `pnpm vitest run` (482 tests), targeted tenant isolation suite, and `grep -rn "x-tenant-id" app/api/` (single read in `runForTenant` after session validation).

### Tasks

- [x] In `app/api/services/_helpers.ts`, change `runForTenant` to resolve the tenant from the session alone and return HTTP 401 when there is no valid session.
- [x] In `app/api/services/_helpers.ts`, return HTTP 403 when a session exists but names a different tenant from an `x-tenant-id` header, rather than silently preferring one.
- [x] In `app/lib/resolve-tenant.ts`, add a `requireSession` option so the public callers keep the slug path and the merchant callers cannot reach it.
- [x] Update `app/api/business-hours/route.ts` and `app/api/bookings/route.ts` to use the session-only path, once #546 and #544 have merged.
- [x] Add `__tests__/app/api/auth/tenant-isolation.test.ts` covering: a header with no session returns 401, a session returns that tenant's rows, a session plus a conflicting header returns 403, and a public booking by slug still succeeds.
- [x] Record the change in `docs/` or the repository README so the next route author does not reintroduce the fallback (`docs/MULTITENANCY.md`).

### Acceptance criteria

- [x] `pnpm build` and `pnpm vitest run` pass with no new failures.
- [x] Against a real database with `pnpm prisma migrate deploy` and `pnpm db:seed` run, `GET /api/services` with an `x-tenant-id` header and no session cookie returns 401 and no service data.
- [x] The same request with a valid session cookie and no header returns 200 and that tenant's three seeded services.
- [x] A request with a valid session for one tenant and an `x-tenant-id` header naming another returns 403.
- [x] `POST /api/public/bookings` with a valid `slug` and no session still returns 201, proving the public path is untouched.
- [x] `grep -rn "x-tenant-id" app/api/` shows the header read only where a session has already been required.

**Progress:** 12/12 tasks complete, 0 remaining

### This run

- Confirmed merchant tenant isolation on branch `cursor/issue-551`; removed duplicate coverage in `__tests__/app/api/tenant-session-auth.test.ts` (same cases live in `tenant-isolation.test.ts` and `run-for-tenant.test.ts`).