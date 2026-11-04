"use client";

import { useState, useTransition } from "react";

import { setRemindersEnabledAction } from "./actions";

type ReminderToggleProps = {
  tenantId: string;
  initialEnabled: boolean;
};

export function ReminderToggle({ tenantId, initialEnabled }: ReminderToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onChange = (next: boolean) => {
    setError(null);
    setEnabled(next);
    startTransition(async () => {
      const result = await setRemindersEnabledAction({ tenantId, enabled: next });
      if (!result.ok) {
        setEnabled(!next);
        setError(result.error ?? "Could not update reminder setting");
      }
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 px-5 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-base font-medium text-white">Appointment reminders</h3>
          <p className="text-sm text-slate-400">
            Send T-24h and T-2h reminders to clients before their booking. Turn off to stop
            subsequent reminder sends for this tenant.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {enabled ? "On" : "Off"}
          </span>
          <input
            aria-label="Enable appointment reminders"
            checked={enabled}
            className="h-4 w-4 accent-emerald-400"
            disabled={pending}
            onChange={(event) => onChange(event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
