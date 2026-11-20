import type { ReactNode } from "react";

type MerchantEmptyStateProps = {
  message: string;
  action?: ReactNode;
};

export function MerchantEmptyState({ message, action }: MerchantEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-center">
      <p className="text-sm text-slate-400">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
