import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settingsManager: vi.fn(() => "settings-manager"),
}));

vi.mock("@/app/(app)/settings/settings-manager", () => ({
  SettingsManager: state.settingsManager,
}));

import SettingsPage from "@/app/(app)/settings/page";

describe("settings page", () => {
  it("renders the persisted settings manager workflow", () => {
    const page = SettingsPage();

    expect(page.type).toBe(state.settingsManager);
  });
});
