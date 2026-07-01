"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TournamentStatus } from "@/generated/prisma/enums";

interface TournamentCancelButtonProps {
  tournamentId: string;
  currentStatus: TournamentStatus;
}

export function TournamentCancelButton({
  tournamentId,
  currentStatus,
}: TournamentCancelButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const router = useRouter();

  if (currentStatus === "CANCELLED" || currentStatus === "FINISHED") {
    return <p className="text-sm text-on-surface-variant">This tournament cannot be cancelled.</p>;
  }

  async function handleCancel() {
    if (
      !confirm(
        "Cancel this tournament in the database? This does NOT cancel the on-chain contract — only the organizer can do that.",
      )
    ) {
      return;
    }

    setStatus("loading");
    setMessage("");

    const res = await fetch(`/api/admin/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    const json = await res.json();

    if (!res.ok) {
      setStatus("error");
      setMessage(json.error?.message || "Failed to cancel tournament");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-lg border border-error/30 bg-error-container/10 p-4">
      <p className="label-caps text-error">Danger zone</p>
      <p className="text-sm text-on-surface-variant">
        Cancelling here only updates the database status. The on-chain contract remains active until
        the organizer submits a cancel transaction.
      </p>
      <button
        type="button"
        onClick={handleCancel}
        disabled={status === "loading"}
        className="label-caps rounded-lg bg-error px-4 py-2 text-on-error transition hover:bg-error/90 disabled:opacity-60"
      >
        {status === "loading" ? "Cancelling…" : "Cancel Tournament (DB only)"}
      </button>
      {message && <p className="text-sm text-error">{message}</p>}
    </div>
  );
}
