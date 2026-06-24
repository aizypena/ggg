import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  buildDeployInitializeTx,
  buildJoinTx,
  explorerContractUrl,
  explorerTxUrl,
  resolveSacAddress,
  submitSignedXdr,
} from "@/lib/stellar";
import type {
  CreateTournamentInput,
  ListQueryInput,
  SubmitInput,
} from "@/lib/validation/tournament";

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

  // Guard against re-submitting an already-confirmed deploy (spec §5: dedupe on
  // confirmed state). contractId has a @unique constraint in the Prisma schema,
  // so a second Prisma update with the same value would also throw a unique
  // violation — but we short-circuit before hitting Stellar at all.
  if (input.intent === "deploy" && tournament.status === "ACTIVE" && tournament.contractId) {
    return {
      txHash: tournament.deployTxHash ?? "",
      contractId: tournament.contractId,
      status: tournament.status,
      explorerUrl: explorerTxUrl(tournament.deployTxHash ?? ""),
    };
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

export async function listTournaments(userId: string, q: ListQueryInput) {
  const rows = await prisma.tournament.findMany({
    where: {
      organizerId: userId,
      ...(q.status ? { status: q.status } : {}),
    },
    include: { _count: { select: { participants: true } } },
    orderBy: { createdAt: "desc" },
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });

  const items = rows.slice(0, q.take).map((t) => ({
    id: t.id,
    name: t.name,
    gameTitle: t.gameTitle,
    status: t.status,
    asset: t.asset,
    entryFee: t.entryFee.toString(),
    pool: (t.entryFee * BigInt(t._count.participants)).toString(),
    participantCount: t._count.participants,
  }));

  const nextCursor = rows.length > q.take ? (rows[q.take]?.id ?? null) : null;

  return { items, nextCursor };
}

export async function buildJoin(
  id: string,
  playerAddress: string,
): Promise<{ unsignedXdr: string; network: string }> {
  const t = await prisma.tournament.findUnique({ where: { id } });
  if (!t) {
    throw Object.assign(new Error("Tournament not found"), { status: 404 });
  }
  if (t.status !== "ACTIVE" || !t.contractId) {
    throw Object.assign(new Error("Tournament is not open for joining"), { status: 409 });
  }
  const { xdr, network } = await buildJoinTx({
    contractId: t.contractId,
    playerAddress,
  });
  return { unsignedXdr: xdr, network };
}

export async function getTournamentDetail(id: string) {
  const t = await prisma.tournament.findUnique({
    where: { id },
    include: {
      participants: { orderBy: { joinedAt: "asc" } },
      payouts: { orderBy: { rank: "asc" } },
    },
  });

  if (!t) return null;

  const pool = (t.entryFee * BigInt(t.participants.length)).toString();

  return {
    id: t.id,
    name: t.name,
    gameTitle: t.gameTitle,
    status: t.status,
    asset: t.asset,
    entryFee: t.entryFee.toString(),
    distributionBps: [t.firstBps, t.secondBps, t.thirdBps] as const,
    contractId: t.contractId,
    contractUrl: t.contractId ? explorerContractUrl(t.contractId) : null,
    tokenAddr: t.tokenAddr,
    organizerAddr: t.organizerAddr,
    refereeAddr: t.refereeAddr,
    pool,
    participants: t.participants.map((p) => ({
      playerAddr: p.playerAddr,
      joinedAt: p.joinedAt.toISOString(),
      joinTxHash: p.joinTxHash,
    })),
    winners: t.payouts.map((p) => ({
      rank: p.rank,
      playerAddr: p.playerAddr,
      amount: p.amount.toString(),
      txHash: p.txHash,
      explorerUrl: p.txHash ? explorerTxUrl(p.txHash) : null,
    })),
  };
}
