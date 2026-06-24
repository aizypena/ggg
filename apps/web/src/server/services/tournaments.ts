import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { buildDeployInitializeTx, resolveSacAddress } from "@/lib/stellar";
import type { CreateTournamentInput } from "@/lib/validation/tournament";

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
