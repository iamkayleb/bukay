# The presentation bar

> What to put in an issue so the result looks like a product people trust with
> money, rather than a form with a button.

"Make it modern" is not a requirement — an agent cannot act on it and a
verifier cannot check it. Everything below is written so it can go into
`## Acceptance Criteria` as-is.

## Non-negotiable: the design system

Bukay has one, in `design-system/`, exposed as Tailwind utilities through
`design-system/tailwind-preset.js`. **Never specify a colour in an issue.**
Specify the token.

| Instead of | Write |
|---|---|
| "dark grey card" | `bg-surface border border-default rounded-card` |
| "muted helper text" | `text-muted text-ds-sm` |
| "green for paid" | `text-pos` |
| "red for failed" | `text-neg` |
| "brand green button" | `bg-accent text-accent-contrast rounded-btn` |

An issue that names a hex value or a `slate-*` utility is specifying a
one-off. The whole app drifts one component at a time that way — it already
did once, which is why the preset exists.

## What makes a money screen feel trustworthy

These are the differences between a table of rows and something a merchant
reads at a glance. Pick the ones a given issue needs; do not demand all of
them every time.

### 1. Money is formatted, aligned, and never raw

- Rendered through the existing helper, not `toString()`. Amounts are stored
  in kobo; a screen showing `500000` instead of `₦5,000` is a defect.
- Right-aligned in tables, so magnitudes line up and a reader can compare
  columns without reading every digit.
- Tabular figures (`font-variant-numeric: tabular-nums`) so digits do not
  jitter between rows.

**As a criterion:**
`- [ ] [AC-3] On /payments, each amount renders as ₦#,### right-aligned, and
a 500000-kobo payment shows ₦5,000 — asserted in e2e/payments.spec.ts`

### 2. Status is a badge, not a word

A bare `pending_payment` in a table cell is a database value leaking into the
interface. Status gets the badge pattern from `design-system/components.css`,
with the status tokens: `pos` paid, `warn` pending, `neg` failed, `info`
informational.

**As a criterion:**
`- [ ] [AC-4] Each booking row shows its status as a badge using the status
tokens, with human wording ("Awaiting payment", not "pending_payment")`

### 3. Every screen has three states, not one

The single most common defect in this app: a screen built for the case where
data exists. Issue #556 exists because five screens go blank.

- **Empty** — says what is missing *and* the action that fixes it. "No
  bookings yet" is half a state; "No bookings yet — share your booking link"
  with the link is the whole one.
- **Loading** — a skeleton in the shape of the content, not a spinner. A
  spinner tells a reader to wait; a skeleton tells them what is coming.
- **Error** — what failed and what to do. Never a raw exception.

**As a criterion:**
`- [ ] [AC-2] With a tenant that has no clients, /clients renders the empty
state with a visible "Add a client" action — asserted in e2e/clients.spec.ts`

### 4. One primary action per screen

Decide what the merchant is most likely to do and make exactly that the accent
button. Everything else is secondary. Three equally-weighted buttons is a
screen that has not been designed.

### 5. Density suits the job

Lists and tables that are read in bulk take `density-compact`. A detail page
or a form does not. The token exists so this is a class, not a rewrite.

### 6. It works at 390px

The merchant screens have never been checked at phone width — that is issue
#555. A new screen should not add to it.

**As a criterion:**
`- [ ] [AC-5] At 390×844 the page has no horizontal scroll and every tap
target is at least 44px — asserted in e2e/<screen>.spec.ts`

### 7. Nothing shows a raw identifier

`cmwf2r7ts000010voq1dtetgq` is not a reference a human can use. A visible id
is either shortened and labelled, or replaced by the thing it names.

## How to put this in an issue

Do not paste this file. Pick the two or three that matter for the screen in
hand and write them as criteria, numbered, each naming its spec. A UI issue
that lists all seven is not a round; it is a quarter.

## What not to specify

- **A colour, ever.** Tokens only.
- **A layout in pixels.** Say what must be visible and legible; the agent
  chooses the arrangement.
- **A component library.** This app is Tailwind on the design system. An issue
  that introduces another one is a dependency decision, not a UI issue, and
  belongs in its own discussion.
