<!-- base-branch: eval/codex -->
<!-- eval-round: 14 -->
<!-- eval-spec: login-form -->
<!-- eval-agent: codex -->

## Why

The sign-in page describes the API in prose instead of offering a form, so no merchant can reach the dashboard. The endpoints already work; only the interface is missing.

## Scope

Replace the placeholder sign-in page with a working two-step form: request a code, then submit it. Use the existing endpoints unchanged.

**Allowed paths:**

- `__tests__/app/login/**`
- `app/login/**`
- `__tests__/**` and `tests/**` for the tests that prove the criteria
- `docs/**` for documentation the change makes stale
- `.agents/**`, `package.json`, `package-lock.json` and `pnpm-lock.yaml` as toolchain output

## Non-Goals

Do not change the auth API, the OTP store, or the session cookie format. No password login, no social login, no new dependencies.

## Tasks

- [ ] Add `app/login/login-form.tsx`: build the client component with a phone step
- [ ] Add `app/login/login-form.tsx`: add the code step shown after a phone is accepted
- [ ] Add `app/login/page.tsx`: render the client component in place of the current description
- [ ] Add `app/login/login-form.tsx`: post the phone to the login endpoint, surfacing the server error text
- [ ] Add `app/login/login-form.tsx`: post the code to the verify endpoint, redirecting on success
- [ ] Add `__tests__/app/login/login-form.test.tsx`: cover the success path
- [ ] Add `__tests__/app/login/login-form.test.tsx`: cover one rejected code

## Acceptance Criteria

- [ ] The page renders a phone input and a submit control, verified by `pnpm test`
- [ ] Submitting a valid phone advances the form to the code step, verified by `pnpm test`
- [ ] A rejected code leaves the user on the code step and shows a message, verified by `pnpm test`
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the codex evaluation lane. Work on the branch cut for this issue and open the pull request against the codex lane branch. Keep changes within the allowed paths listed under Scope; the acceptance verifier reports anything outside them as out of scope. Application code lives under the app directory and tests under the repository test directory; follow the existing layout rather than starting a parallel tree.

<details>
<summary>Original Issue</summary>

```text
Seeded from the round 14 specification, spec login-form, agent codex.
```

</details>
