import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MerchantEmptyState } from "@/app/(app)/components/merchant-empty-state";
import { merchantEmptyMessages } from "@/app/(app)/merchant-empty-copy";

describe("MerchantEmptyState", () => {
  it("renders copy with an accessible status region", () => {
    const html = renderToStaticMarkup(
      <MerchantEmptyState message={merchantEmptyMessages.payments} />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain(merchantEmptyMessages.payments);
  });

  it("renders an optional action below the message", () => {
    const html = renderToStaticMarkup(
      <MerchantEmptyState
        message={merchantEmptyMessages.today}
        action={<a href="/calendar">Add a booking on the calendar</a>}
      />
    );

    expect(html).toContain(merchantEmptyMessages.today);
    expect(html).toContain('href="/calendar"');
    expect(html).toContain("Add a booking on the calendar");
  });
});