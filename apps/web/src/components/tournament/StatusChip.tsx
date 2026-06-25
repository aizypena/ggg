// Server Component — no "use client"
type Status = "DRAFT" | "ACTIVE" | "FINISHED" | "CANCELLED";

const styles: Record<Status, string> = {
  DRAFT: "border-outline-variant text-on-surface-variant",
  ACTIVE: "border-acid-yellow text-acid-yellow",
  FINISHED: "border-outline-variant text-on-surface-variant",
  CANCELLED: "border-error text-error",
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span
      className={`label-caps inline-flex items-center rounded-full border-2 px-3 py-1 ${styles[status]}`}
      data-testid="status-chip"
      data-status={status}
    >
      {status}
    </span>
  );
}
