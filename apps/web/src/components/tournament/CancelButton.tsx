"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signAndSubmit } from "@/lib/wallet";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";

type Phase = "idle" | "confirm" | "signing" | "submitting" | "error";

export function CancelButton({
  tournamentId,
  passphrase,
}: {
  tournamentId: string;
  passphrase: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const isPending = phase === "signing" || phase === "submitting";

  function handleInitiate() {
    setError(null);
    setPhase("confirm");
  }

  function handleDismiss() {
    setPhase("idle");
    setError(null);
  }

  async function handleConfirm() {
    setError(null);
    try {
      setPhase("submitting");
      const res = await fetch(`/api/tournaments/${tournamentId}/cancel`, { method: "POST" });
      const built = (await res.json()) as {
        ok: boolean;
        data?: { unsignedXdr: string; network: string };
        error?: string;
      };
      if (!built.ok) {
        throw new Error(built.error ?? "Cancel request failed");
      }

      setPhase("signing");
      await signAndSubmit(
        built.data!.unsignedXdr,
        "cancel",
        `/api/tournaments/${tournamentId}/submit`,
        passphrase,
      );

      setPhase("idle");
      router.refresh();
    } catch (e: unknown) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  return (
    <>
      {phase === "idle" && (
        <button
          type="button"
          onClick={handleInitiate}
          data-testid="cancel-button"
          className="label-caps rounded-lg border-2 border-error px-4 py-2 text-error hover:bg-error-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
        >
          Cancel & Refund
        </button>
      )}

      {phase === "confirm" && (
        <div
          role="alertdialog"
          aria-modal="false"
          aria-label="Confirm tournament cancellation"
          className="rounded-lg border-2 border-error bg-error-container p-4"
        >
          <p className="label-caps text-error">
            This action is irreversible. All participants will be refunded.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              aria-disabled={isPending}
              data-testid="confirm-cancel"
              className="label-caps rounded-lg bg-error px-4 py-2 text-on-error disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-error"
            >
              Confirm Cancel
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={isPending}
              className="label-caps rounded-lg border-2 border-outline px-4 py-2 text-on-surface disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline"
            >
              Go Back
            </button>
          </div>
        </div>
      )}

      {phase === "error" && error && (
        <>
          <p className="mt-2 text-error" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="label-caps mt-2 rounded-lg border-2 border-outline px-4 py-2 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-outline"
          >
            Dismiss
          </button>
        </>
      )}

      <SubmitStateModal
        open={isPending}
        phase={phase === "submitting" ? "submitting" : phase === "signing" ? "signing" : "idle"}
      />
    </>
  );
}
