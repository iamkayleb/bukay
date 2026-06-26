import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CalendarPage from "@/app/(app)/app/calendar/page";
import ClientsPage from "@/app/(app)/app/clients/page";
import AppHomePage from "@/app/(app)/app/page";
import AppServicesPage from "@/app/(app)/app/services/page";
import SettingsPage from "@/app/(app)/app/settings/page";

describe("authenticated app section empty states", () => {
  it.each([
    ["Today", AppHomePage, "Appointments, reminders, and check-ins scheduled for today"],
    ["Calendar", CalendarPage, "Your booking calendar will show upcoming appointments"],
    ["Clients", ClientsPage, "Client profiles, contact details, and visit history"],
    ["Services", AppServicesPage, "Service categories, pricing, durations"],
    ["Settings", SettingsPage, "Workspace preferences, team access"],
  ])("renders the %s empty state", (_section, Page, description) => {
    const html = renderToStaticMarkup(<Page />);

    expect(html).toContain("Nothing here yet");
    expect(html).toContain(description);
  });
});
