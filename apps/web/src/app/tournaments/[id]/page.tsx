import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth-guards";
import { getTournamentDetail } from "@/server/services/tournaments";
import { StatusChip } from "@/components/tournament/StatusChip";
import { ContractAddress } from "@/components/tournament/ContractAddress";
import { PrizePoolCounter } from "@/components/tournament/PrizePoolCounter";
import { JoinCard } from "@/components/tournament/JoinCard";
import { ParticipantList } from "@/components/tournament/ParticipantList";
import { LiveFeed } from "@/components/tournament/LiveFeed";
import { RefereePanel } from "@/components/tournament/RefereePanel";
import { WinnersPanel } from "@/components/tournament/WinnersPanel";
import { CancelButton } from "@/components/tournament/CancelButton";

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch tournament + viewer identity in parallel — page is PUBLIC so null user is fine.
  const [t, currentUser] = await Promise.all([getTournamentDetail(id), getCurrentUser()]);

  if (!t) notFound();

  const passphrase = env.NETWORK_PASSPHRASE;
  // USDC_ISSUER is optional in the env schema; null-coalesce for XLM tournaments.
  const assetIssuer: string | null = t.asset === "USDC" ? (env.USDC_ISSUER ?? null) : null;

  // Organiser affordance: the cancel button is gated on both user identity (via
  // organizerId from the detail) and tournament status. The server-side IDOR
  // remains enforced in the cancel API route regardless of this UI gate.
  const isOrganiser = currentUser?.id === t.organizerId;
  const canCancel = isOrganiser && t.status === "ACTIVE";

  return (
    <main
      aria-label={`${t.name} tournament detail`}
      className="mx-auto max-w-(--spacing-container-max) px-4 py-12 md:px-(--spacing-margin-desktop)"
    >
      {/* ------------------------------------------------------------------ */}
      {/* Header — tournament name, game, status, contract address            */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-caps text-on-surface-variant">{t.gameTitle}</p>
          <h1 className="text-[48px] font-extrabold -tracking-[0.04em] text-on-surface">
            {t.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="data-mono text-xs text-on-surface-variant">ID {t.id}</span>
            {t.contractId && <ContractAddress value={t.contractId} />}
            {t.contractUrl && t.contractId && (
              <a
                href={t.contractUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="label-caps text-electric-violet underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-acid-yellow"
                aria-label="View contract on Stellar explorer"
              >
                Explorer ↗
              </a>
            )}
          </div>
        </div>
        <StatusChip status={t.status} />
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* CANCELLED banner                                                    */}
      {/* ------------------------------------------------------------------ */}
      {t.status === "CANCELLED" && (
        <section
          aria-labelledby="cancelled-heading"
          className="mt-8 rounded-2xl border-2 border-error bg-error-container p-6"
        >
          <p id="cancelled-heading" className="label-caps text-error" role="alert">
            This tournament has been cancelled. All participants have been refunded.
          </p>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Main content grid — 8-col body + 4-col sidebar on large screens     */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-10 grid gap-8 lg:grid-cols-12">
        {/* ============================================================== */}
        {/* Left / body column                                              */}
        {/* ============================================================== */}
        <div className="flex flex-col gap-8 lg:col-span-8">
          {/* Prize pool — always shown (even post-settlement / cancelled) */}
          <PrizePoolCounter
            tournamentId={t.id}
            initialPool={t.pool}
            asset={t.asset}
            participantCount={t.participants.length}
            entryFee={t.entryFee}
          />

          {/* Join card — ACTIVE only, requires a deployed contract */}
          {t.status === "ACTIVE" && t.contractId && (
            <JoinCard
              tournamentId={t.id}
              contractId={t.contractId}
              entryFee={t.entryFee}
              asset={t.asset}
              assetIssuer={assetIssuer}
              passphrase={passphrase}
            />
          )}

          {/* Winners — FINISHED only, and only when payouts exist */}
          {t.status === "FINISHED" && t.winners.length > 0 && (
            <WinnersPanel winners={t.winners} asset={t.asset} />
          )}

          {/* Participants — always shown */}
          <section aria-label="Participants" className="kinetic-glass rounded-2xl p-6">
            <ParticipantList participants={t.participants} />
          </section>
        </div>

        {/* ============================================================== */}
        {/* Right / sidebar column                                          */}
        {/* ============================================================== */}
        <aside aria-label="Tournament tools" className="flex flex-col gap-8 lg:col-span-4">
          {/* Live activity feed — always shown */}
          <LiveFeed tournamentId={t.id} />

          {/* Referee panel — ACTIVE only; self-hides unless wallet === referee */}
          {t.status === "ACTIVE" && (
            <RefereePanel tournamentId={t.id} refereeAddr={t.refereeAddr} passphrase={passphrase} />
          )}

          {/* Cancel button — organiser + ACTIVE only */}
          {canCancel && (
            <section aria-label="Organiser actions" className="rounded-xl bg-surface-container p-4">
              <p className="label-caps mb-3 text-error">Danger zone</p>
              <CancelButton tournamentId={t.id} passphrase={passphrase} />
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
