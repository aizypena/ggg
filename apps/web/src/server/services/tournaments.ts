import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buildDeployInitializeTx, resolveSacAddress, submitSignedXdr } from "@/lib/stellar";
import type { CreateTournamentInput, SubmitInput } from "@/lib/validation/tournament";

export async function createTournament(
  input: CreateTournamentInput,
  userId: string,
): Promise<{ tournamentId: string; unsignedXdr: string; network: string }> {
  const tokenAddr = resolveSacAddress(input.asset);

  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      gameTitle: input.gameTitle,
      asset: input.asset,
      entryFee: input.entryFee,
      firstBps: input.distributionBps[0],
      secondBps: input.distributionBps[1],
      thirdBps: input.distributionBps[2],
      organizerId: userId,
      organizerAddr: input.organizerAddress,
      refereeAddr: input.refereeAddress,
      tokenAddr,
      coverImageKey: input.coverImageKey ?? null,
      status: "DRAFT",
    },
  });

  const { xdr: unsignedXdr } = await buildDeployInitializeTx({
    organizerAddress: input.organizerAddress,
    refereeAddress: input.refereeAddress,
    tokenAddr,
    entryFee: input.entryFee,
    distributionBps: input.distributionBps,
  });

  return { tournamentId: tournament.id, unsignedXdr, network: env.STELLAR_NETWORK };
}

export interface SubmitTxResult {
  txHash: string;
  contractId?: string | null;
  status: string;
  explorerUrl: string;
}

/**
 * Submits a client-signed XDR on-chain and reconciles confirmed state into the
 * database. Mutates the tournament record ONLY after the Stellar network
 * confirms success (`status === "SUCCESS"`). Never persists success state on an
 * optimistic or failed result.
 *
 * Ownership: deploy/cancel are organiser-only; finalize is organiser/referee;
 * join is public (participant records are created by the event subscriber in
 * Phase 5).
 */
export async function submitTournamentTx(
  id: string,
  input: SubmitInput,
  userId: string,
): Promise<SubmitTxResult> {
  const { explorerTxUrl } = await import("@/lib/stellar");

  const tournament = await prisma.tournament.findUnique({ where: { id } });
  if (!tournament) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }

  // deploy and cancel are organiser-scoped (IDOR guard).
  if (
    (input.intent === "deploy" || input.intent === "cancel") &&
    tournament.organizerId !== userId
  ) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }

  const result = await submitSignedXdr(input.signedXdr, input.intent);

  if (result.status === "FAILED") {
    // Do NOT mutate tournament to any success state.
    throw Object.assign(new Error(`Transaction failed on-chain (${result.hash})`), { status: 502 });
  }

  // Persist confirmed on-chain state.
  if (input.intent === "deploy") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: {
        contractId: result.contractId ?? null,
        status: "ACTIVE",
        deployTxHash: result.hash,
      },
    });
    return {
      txHash: result.hash,
      contractId: updated.contractId,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
    };
  }

  if (input.intent === "cancel") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    return {
      txHash: result.hash,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
    };
  }

  if (input.intent === "finalize") {
    const updated = await prisma.tournament.update({
      where: { id },
      data: { status: "FINISHED", finalizedAt: new Date() },
    });
    return {
      txHash: result.hash,
      status: updated.status,
      explorerUrl: explorerTxUrl(result.hash),
    };
  }

  // join: participant records created by event subscriber (Phase 5); no DB mutation here.
  return {
    txHash: result.hash,
    status: tournament.status,
    explorerUrl: explorerTxUrl(result.hash),
  };
}
