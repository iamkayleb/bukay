import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionPlaceholder } from "@/app/(app)/components/section-placeholder";

describe("visual regression — empty-state placeholders", () => {
  it("renders the Today placeholder with the expected DOM and class shape", () => {
    const html = renderToStaticMarkup(
      <SectionPlaceholder
        description="Your day's appointments, reminders, and quick actions will show up here."
        hint="No appointments yet. Bookings will appear in this view."
        title="Today"
      />
    );

    expect(html).toMatchSnapshot();
  });

  it("uses the default hint when no hint prop is provided", () => {
    const html = renderToStaticMarkup(
      <SectionPlaceholder
        description="Manage tenant preferences, business hours, branding, and integrations."
        title="Settings"
      />
    );

    expect(html).toContain("Nothing here yet — content will appear when available.");
    expect(html).toContain("Settings");
  });

  it("renders the Calendar placeholder consistently", () => {
    const html = renderToStaticMarkup(
      <SectionPlaceholder
        description="Browse and manage upcoming bookings across the week or month."
        hint="No scheduled bookings yet. Confirmed appointments will populate the calendar."
        title="Calendar"
      />
    );

    expect(html).toMatchSnapshot();
  });
});
