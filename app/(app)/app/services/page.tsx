import { SectionEmptyState } from "../_components/section-empty-state";

export default function AppServicesPage() {
  return (
    <SectionEmptyState
      eyebrow="Services"
      title="Services"
      description="Service categories, pricing, durations, and booking buffers will appear here after setup."
      primaryAction="Add service"
    />
  );
}
