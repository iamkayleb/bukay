import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { PaymentsList } from "@/app/(app)/payments/payments-list";
import { merchantEmptyMessages } from "@/app/(app)/merchant-empty-copy";

describe("PaymentsList", () => {
  it('shows "No payments yet" when there are no payments', () => {
    const html = renderToStaticMarkup(<PaymentsList payments={[]} />);

    expect(html).toContain(merchantEmptyMessages.payments);
    expect(html).toContain('data-testid="payments-empty"');
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-label="Payments"');
  });

  it("renders the payments table when rows exist", () => {
    const html = renderToStaticMarkup(
      <PaymentsList
        payments={[
          {
            id: "pay-1",
            amountCents: 5000,
            currency: "NGN",
            status: "paid",
            createdAt: new Date("2026-10-04T09:00:00.000Z"),
            clientName: "Ada Okonkwo",
            serviceName: "Classic Haircut",
          },
        ]}
      />
    );

    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("Classic Haircut");
    expect(html).toContain('aria-label="Payments"');
    expect(html).not.toContain(merchantEmptyMessages.payments);
  });
});