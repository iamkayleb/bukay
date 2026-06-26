import { SectionEmptyState } from "../_components/section-empty-state";

export default function ClientsPage() {
  return (
    <SectionEmptyState
      eyebrow="Clients"
      title="Clients"
      description="Client profiles, contact details, and visit history will appear here after you add them."
      primaryAction="Add client"
    />
  );
}
