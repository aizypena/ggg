/**
 * verify-cancel-refund — runs the #84 cancel→refund E2E spec against a deployed
 * Testnet app and reports PASS/FAIL with the captured refund context.
 *
 *   APP_URL=<deployed-testnet-url> pnpm --filter web exec tsx ../../scripts/verify-cancel-refund.ts
 *   # or from repo root:  pnpm dlx tsx scripts/verify-cancel-refund.ts
 */
import { runSpec } from "./verify-e2e-lib";

process.exit(
  runSpec({
    spec: "e2e/cancel-refund.spec.ts",
    label: "P6.3 cancel → refund (status CANCELLED + refund rows)",
    marker: "[cancel-refund]",
  }),
);
