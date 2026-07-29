type ToastTone = "error" | "success";

type ToastProps = {
  message: string | null;
  tone?: ToastTone;
};

const toneStyles: Record<ToastTone, string> = {
  error: "border-red-900/70 bg-red-950/90 text-red-100",
  success: "border-emerald-900/70 bg-emerald-950/90 text-emerald-100",
};

export function Toast({ message, tone = "success" }: ToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 w-[min(22rem,calc(100vw-2rem))]">
      <div
        className={`rounded-md border px-4 py-3 text-sm shadow-lg shadow-slate-950/40 ${toneStyles[tone]}`}
        role="alert"
      >
        {message}
      </div>
    </div>
  );
}
