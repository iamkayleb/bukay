<!-- base-branch: eval/claude -->
<!-- eval-round: 1 -->
<!-- eval-spec: scaffold -->
<!-- eval-agent: claude -->

## Why

Nothing else can be built until the app skeleton, database client and CI entry points exist.

## Scope

Create a Next.js 14 (App Router) + TypeScript + Tailwind + Prisma + Postgres application in this repository.

## Non-Goals

Do not modify any file under `.github/` — those workflows are centrally managed.

## Tasks

- [ ] Initialize the app with `package.json`, `next.config.js` and `tsconfig.json`
- [ ] Add `app/globals.css`: add Tailwind via `tailwind.config.ts` and
- [ ] Add `prisma/schema.prisma`: add Prisma with a Postgres datasource
- [ ] Add `/api/health`: create the  route in `app/api/health/route.ts` returning `{ok, version}`
- [ ] Add `.env.example` declaring `DATABASE_URL` and `NEXTAUTH_SECRET`
- [ ] Configure `.eslintrc.json`, `.prettierrc` and `.editorconfig`
- [ ] Add `dev`, `build` and `test` scripts to `package.json`

## Acceptance Criteria

- [ ] `GET /api/health` returns HTTP 200 with a JSON body
- [ ] `pnpm test` passes
- [ ] `pnpm build` completes and `pnpm dev` starts the server
- [ ] CI is green on this pull request
