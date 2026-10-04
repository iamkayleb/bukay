import { describe, expect, it } from "vitest";

import {
  getRemindersEnabled,
  parseRemindersToggle,
  setRemindersEnabled,
  type ReminderSettingsClient,
} from "@/app/lib/reminder-settings";

function fakeClient(initial: boolean) {
  const row = { remindersEnabled: initial };
  const client: ReminderSettingsClient = {
    tenant: {
      async findUnique({ where }) {
        return where.id === "t1" ? { ...row } : null;
      },
      async update({ data }) {
        row.remindersEnabled = data.remindersEnabled;
        return row;
      },
    },
  };
  return client;
}

describe("reminder settings", () => {
  it("disabling the toggle is persisted and read back", async () => {
    const client = fakeClient(true);
    expect(await getRemindersEnabled(client, "t1")).toBe(true);
    await setRemindersEnabled(client, "t1", false);
    expect(await getRemindersEnabled(client, "t1")).toBe(false);
  });

  it("treats an unknown tenant as disabled", async () => {
    expect(await getRemindersEnabled(fakeClient(true), "missing")).toBe(false);
  });

  it("parses the checkbox", () => {
    const on = new FormData();
    on.set("remindersEnabled", "on");
    expect(parseRemindersToggle(on)).toBe(true);
    expect(parseRemindersToggle(new FormData())).toBe(false);
  });
});
