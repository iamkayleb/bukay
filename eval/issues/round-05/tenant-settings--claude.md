<!-- base-branch: eval/claude -->
<!-- eval-round: 5 -->
<!-- eval-spec: tenant-settings -->
<!-- eval-agent: claude -->

## Why

Branding and locale settings are prerequisites for the public page and payments.

## Scope

Settings for business name, slug, timezone, currency, logo, brand colour and cancellation policy.

## Non-Goals

If object-storage credentials are unavailable, implement `lib/storage/local.ts` behind the same port.

## Tasks

- [ ] Add `app/(app)/settings/page.tsx`: build the form
- [ ] Add `app/api/settings/route.ts`: implement  with slug uniqueness checks
- [ ] Add `lib/storage/provider.ts`: define the storage port with a local adapter
- [ ] Add `lib/contrast.ts`: add the contrast check

## Acceptance Criteria

- [ ] Changing the slug moves the public page, verified by `pnpm test`
- [ ] Logo and brand colour render on `/{slug}`
- [ ] A duplicate slug returns HTTP 409 with a field-level message
- [ ] `pnpm test` passes

## Implementation Notes

Seeded for the `claude` evaluation lane. Work on the branch cut for this issue and open the pull request against `eval/claude`. Keep changes limited to the files named in Tasks.

<details>
<summary>Original Issue</summary>

```text
Seeded from eval/rounds/round-05.json, spec `tenant-settings`, agent `claude`.
```

</details>
