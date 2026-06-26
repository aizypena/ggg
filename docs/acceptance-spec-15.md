# Acceptance — SPEC §15 (six criteria) on deployed Testnet

This is the operator checklist for **issue #89**: verifying the six SPEC §15
acceptance criteria against a live Testnet deployment. It pairs with the
RUNBOOK §8 table (paste results there) and is driven by the Phase 6 E2E specs
(#83 demo-path, #84 cancel-refund).

## How to run

```bash
# Prereqs: Railway Testnet deploy live (#88/#122), subscriber running,
# Playwright Chromium installed, Friendbot-funded keypairs (global-setup).
APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test e2e/demo-path.spec.ts
APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test e2e/cancel-refund.spec.ts
```

Record the start/finish wall-clock for the demo-path run (criterion 6), and open
each `explorer-link` on Stellar.Expert to cross-check (criteria 3, 4).

## The six criteria

| # | Criterion | Command / how to verify | Expected outcome | Where to check | Status |
|---|-----------|-------------------------|------------------|----------------|:------:|
| 1 | **Organizer creates a tournament (with QR)** | demo-path spec: deploy step | `status-chip` = ACTIVE, a `C…` contract id, `join-qr` visible | UI detail page · Explorer (contract) | ✅ PASS |
| 2 | **Players join with entry fee** | demo-path: 3 joins | `participant-row` ×3; `pool-amount` ticks to 3× entry fee live (SSE) | UI (no refresh) · DB `Participant` · Explorer (join txs) | ✅ PASS |
| 3 | **Referee finalizes results** | demo-path: settlement console finalize | one `finalize` tx; `status-chip` = FINISHED | UI · Explorer (finalize tx) · DB `Tournament.finalizedAt` | ✅ PASS |
| 4 | **Payouts to winners (60/30/10)** | demo-path: payout assertions | `payout-row` ×3 split 60/30/10 (dust to 1st); 3 `explorer-link`s | UI WinnersPanel · DB `Payout` · Explorer | ✅ PASS |
| 5 | **Organizer cancels & refunds** | cancel-refund spec | `status-chip` = CANCELLED; one `refund-row` per player = entry fee | UI · Explorer (refund txs) · DB `Tournament.cancelledAt` | ✅ PASS |
| 6 | **Contract emits events (visible on Horizon)** | subscriber ingests `registered`/`finalized`/`cancelled`; LiveFeed updates | events on Horizon/RPC; `ContractEvent` rows; live `LiveFeed` glosses | Horizon `/operations` · DB `ContractEvent` · UI LiveFeed | ✅ PASS |
| — | **Happy path < 2 minutes** (SPEC §15) | stopwatch the demo-path run | well under 120s (Playwright `timeout: 120_000`) | runner elapsed time | ✅ PASS |

Legend: ☐ unchecked · ⏳ pending live deploy · ✅ PASS · ❌ FAIL.

> **Acceptance run — 2026-06-26 (all six PASS).** Both specs were run against a
> local production `next start` pointed at Testnet (web + subscriber + Postgres 17
> + Redis + Testnet RPC/Horizon); per the #89 note Railway is not strictly
> required. `e2e/demo-path.spec.ts` passed in ~90s (contract `CB27RNHU…RFR5`
> ACTIVE + QR, 3 participants, finalize tx `e288516862…7a0f`, 3 payouts 60/30/10,
> 3 explorer links); `e2e/cancel-refund.spec.ts` passed in ~82s (status CANCELLED,
> 2 refunds @ 2 XLM). The run uncovered five bugs (deploy→initialize, three
> subscriber ingestion bugs, and the E2E URL/timing harness) — all fixed in PR #134.

## What has been verified locally (this PR)

These remove the "auth gap" and "selectors unverifiable" blockers so the live
run is the only remaining step:

- **Auth seam** — the NextAuth credentials login flow (`/api/auth/csrf` →
  `/api/auth/callback/credentials` → `ggg.session`) is verified end-to-end
  against a local dev server (`e2e/fixtures/auth.ts`).
- **Selectors** — every `data-testid` the specs query renders in the real DOM,
  verified by `apps/web/src/components/tournament/wired-selectors.test.tsx`.
- **Specs load** — both specs compile and list under Playwright.
- **Testnet egress** — Friendbot + Soroban RPC reachable from the runner host.

## What remains (operator, live env)

Criteria 1–6 each assert on **real on-chain state** and **SSE propagation**, so
they can only be confirmed against the deployed Railway Testnet app (#88) with a
running subscriber. Run the two specs, cross-check explorer links, stopwatch the
happy path, and paste outcomes into **RUNBOOK §8** and the Status column above.

## Cross-checking on Stellar.Expert

`https://stellar.expert/explorer/testnet/tx/<hash>` for each tx;
`https://stellar.expert/explorer/testnet/contract/<C…>` for the contract. Confirm
the deploy+initialize, three joins, the 60/30/10 finalize, and (separately) the
per-player refunds.
