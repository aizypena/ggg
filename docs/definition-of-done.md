# Definition of Done — Phase 6 ship gate (#91)

Final audit aggregating every Phase 6 gate. Re-run the local gates with the
commands shown; the live/deploy gates require the Railway Testnet environment
(#88). **Verdict at bottom.**

## Gate results

| Gate | Command / source | Status | Notes |
|------|------------------|:------:|-------|
| Typecheck | `pnpm -r typecheck` | ✅ PASS | all workspaces |
| Lint | `pnpm -r lint` | ✅ PASS | 1 pre-existing warning (`middleware.ts` unused `_req`) |
| Unit tests | `pnpm -r test` | ✅ PASS | web 454 (with seeded DB), subscriber 16, contract 28 |
| Audit (high) | `pnpm audit --audit-level high` | ✅ PASS | 0 high (axios override); 3 moderate below gate |
| Contract build | `cd contracts/escrow && cargo test` | ✅ PASS | 28 tests |
| CI green on PRs | `.github/workflows/ci.yml` (`app` + `contract`) | ✅ PASS | recent develop-targeted PRs green |
| **Production build** | `pnpm --filter web build` | ❌ **FAIL** | Turbopack: `@/contract-client` resolution, `fs`/argon2 in a client bundle, `globals.css` `@import` ordering. **CI does not run `next build`, so this is uncaught.** |
| Docker Compose | `docker compose config` | ✅ PASS | postgres 17 + redis 7 + minio + bucket bootstrap; pg/redis verified healthy |
| Subscriber service | verified in P5.12 (#81) | ✅ PASS | ingests → Redis → SSE locally |
| Security headers / CSP (#85/#119) | `buildSecurityHeaders()` + test | ✅ PASS | merged (features.md) |
| No secrets in repo | `git grep -nE 'SECRET_ACCESS_KEY\|ADMIN_PASSWORD=\|secret\(\)' -- ':!*.example' ':!*.md'` | ✅ PASS | matches are env-var names / CI dummy values / throwaway Testnet keys only |
| E2E demo path (#83) | `playwright test e2e/demo-path.spec.ts` | ⏳ BLOCKED | spec + selectors + auth verified locally; on-chain run needs live deploy |
| E2E cancel→refund (#84) | `playwright test e2e/cancel-refund.spec.ts` | ⏳ BLOCKED | same |
| Acceptance §15 (#89) | `docs/acceptance-spec-15.md` | ⏳ BLOCKED | needs live deploy + the two specs run on it |
| Railway deploy live (#88) | Railway | ❌ NOT LIVE | blocked by the production-build failure above |
| Env vars configured | RUNBOOK §4 | ⏳ pending deploy | matrix documented; values set at provision time |
| Branch protection | RUNBOOK §6 (one-time maintainer step) | ⏳ pending | requires repo admin; cannot be set from CI |
| Docs (README/SPEC/AGENT/RUNBOOK) | repo | ✅ PRESENT | RUNBOOK §8 acceptance table updated this PR |

## Blockers (in priority order)

1. **Production build is broken** (`next build` fails). This is the root ship
   blocker — Railway's web build runs `db:generate && next build`, so the deploy
   (#88) cannot succeed until it's fixed. CI is green only because it doesn't run
   a production build. → **follow-up issue required.**
2. **No live Testnet deploy** (#88) → E2E acceptance (#83/#84/#89) cannot run.
   Gated on (1).
3. **Branch protection not enabled** — one-time maintainer action (RUNBOOK §6).

## Verdict

**🚫 BLOCKED — not ready to ship.**

Local quality gates (typecheck, lint, tests, audit, contract build, CI) are
green and the security/secret/docker gates pass. But the production build fails,
which blocks the deploy and therefore all live acceptance. Recommended order:
fix the build (follow-up) → deploy to Railway (#88) → run the E2E specs +
§15 acceptance (#83/#84/#89) → enable branch protection → re-run this sweep.
