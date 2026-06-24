"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrTile } from "./QrTile";
import { WalletButton } from "./WalletButton";
import { ContractAddress } from "./ContractAddress";
import { SubmitStateModal } from "@/components/ui/SubmitStateModal";
import { signAndSubmit } from "@/lib/wallet";

type Asset = "XLM" | "USDC";

interface JoinCardProps {
  tournamentId: string;
  contractId: string;
  /** Entry fee in stroops (smallest unit) as a string, e.g. "10000000" = 1 XLM. */
  entryFee: string;
  asset: Asset;
  /** Required for non-native assets (USDC etc.). Null for XLM. */
  assetIssuer: string | null;
  /** Network passphrase — passed from the server shell, not imported here. */
  passphrase: string;
}

type Phase = "idle" | "signing" | "submitting" | "success" | "error";

/**
 * buildSep7Uri — constructs a SEP-0007 `web+stellar:pay` URI per SPEC §8.
 *
 * Format: web+stellar:pay?destination=<contractId>&amount=<entryFee>&memo=<tournamentId>&asset_code=<asset>[&asset_issuer=<issuer>]
 * The `asset_issuer` param is omitted for native XLM.
 */
function buildSep7Uri(props: JoinCardProps): string {
  const params = new URLSearchParams();
  params.set("destination", props.contractId);
  params.set("amount", props.entryFee);
  params.set("memo", props.tournamentId);
  params.set("asset_code", props.asset);
  if (props.asset !== "XLM" && props.assetIssuer) {
    params.set("asset_issuer", props.assetIssuer);
  }
  // URLSearchParams encodes spaces as '+'; SEP-7 URIs expect %20. Also keep
  // ':' and '?' literal in the scheme prefix.
  return `web+stellar:pay?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * JoinCard — SEP-7 QR join flow (FLOW 02).
 *
 * Composes:
 * - QrTile: SEP-7 `web+stellar:pay` URI as a scannable QR code.
 * - ContractAddress: copyable contract address.
 * - WalletButton: connects Freighter; provides `playerAddress`.
 * - Join button: POSTs to /api/tournaments/[id]/join, signs XDR via Freighter,
 *   submits to /api/tournaments/[id]/submit, then refreshes the page on success.
 * - SubmitStateModal: reflects signing → submitting → success/error states.
 */
export function JoinCard(props: JoinCardProps) {
  const router = useRouter();
  const [player, setPlayer] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sep7Uri = buildSep7Uri(props);
  const isPending = phase === "signing" || phase === "submitting";

  async function onJoin() {
    if (!player || isPending) return;
    setErrorMsg(null);
    setPhase("submitting");

    try {
      // 1. Build unsigned XDR from the server.
      const buildRes = await fetch(`/api/tournaments/${props.tournamentId}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerAddress: player }),
      });
      const built = (await buildRes.json()) as {
        ok: boolean;
        data?: { unsignedXdr: string; network: string };
        error?: string;
      };
      if (!built.ok) {
        throw new Error(built.error ?? "Failed to build join transaction");
      }

      // 2. Sign (Freighter) + submit.
      setPhase("signing");
      await signAndSubmit(
        built.data!.unsignedXdr,
        "join",
        `/api/tournaments/${props.tournamentId}/submit`,
        props.passphrase,
      );

      // 3. Success — refresh so the participant list / pool updates.
      setPhase("success");
      router.refresh();
    } catch (e: unknown) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : "Join failed");
    }
  }

  function onModalClose() {
    setPhase("idle");
    setErrorMsg(null);
  }

  return (
    <div className="kinetic-glass rounded-2xl p-6">
      <p className="label-caps text-on-surface-variant">Scan to join</p>

      <div className="mt-4 flex flex-col items-start gap-4">
        <QrTile value={sep7Uri} />

        <ContractAddress value={props.contractId} />

        {/* SEP-7 URI displayed for reference — data-mono for on-chain readability */}
        <code className="data-mono break-all text-xs text-on-surface-variant">{sep7Uri}</code>

        <div className="flex flex-wrap items-center gap-3">
          <WalletButton expectedPassphrase={props.passphrase} onConnected={setPlayer} />

          <button
            type="button"
            onClick={onJoin}
            disabled={!player || isPending}
            aria-disabled={!player || isPending}
            className="brutalist-border label-caps bg-electric-violet-strong px-6 py-3 italic text-background transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
          >
            Join Tournament
          </button>
        </div>
      </div>

      {/* Error display — role="alert" for screen readers */}
      {errorMsg && phase === "error" && (
        <p role="alert" className="mt-3 text-sm text-error">
          {errorMsg}
        </p>
      )}

      <SubmitStateModal
        open={isPending || phase === "success" || phase === "error"}
        phase={phase}
        {...(errorMsg !== null ? { message: errorMsg } : {})}
        onClose={onModalClose}
      />
    </div>
  );
}
