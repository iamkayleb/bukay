import { SectionEmptyState } from "../_components/section-empty-state";

export default function CalendarPage() {
  return (
    <SectionEmptyState
      eyebrow="Calendar"
      title="Calendar"
      description="Your booking calendar will show upcoming appointments once clients start scheduling."
      primaryAction="Create booking"
    />
  );
}
