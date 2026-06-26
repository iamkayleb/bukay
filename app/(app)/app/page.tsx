import { SectionEmptyState } from "./_components/section-empty-state";

export default function AppHomePage() {
  return (
    <SectionEmptyState
      eyebrow="Today"
      title="Today"
      description="Appointments, reminders, and check-ins scheduled for today will appear here."
      primaryAction="Add appointment"
    />
  );
}
