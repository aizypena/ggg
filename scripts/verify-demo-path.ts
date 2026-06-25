/**
 * verify-demo-path — runs the #83 demo-path E2E spec against a deployed Testnet
 * app and reports PASS/FAIL with the captured payout explorer links.
 *
 *   APP_URL=<deployed-testnet-url> pnpm --filter web exec tsx ../../scripts/verify-demo-path.ts
 *   # or from repo root:  pnpm dlx tsx scripts/verify-demo-path.ts
 */
import { runSpec } from "./verify-e2e-lib";

process.exit(
  runSpec({
    spec: "e2e/demo-path.spec.ts",
    label: "P6.2 demo path (create → join ×3 → finalize → 3 payouts)",
    marker: "[demo-path]",
  }),
);
