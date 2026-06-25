/**
 * Shared runner for the Phase 6 acceptance E2E specs (#83 demo, #84 cancel).
 *
 * Invokes a single Playwright spec against a deployed Testnet app (`APP_URL`),
 * streams its output, harvests Stellar.Expert explorer links / tx hashes from
 * the spec's `console.log` markers, and prints a PASS/FAIL summary.
 *
 * These E2E paths perform REAL on-chain transactions, so they require a live
 * deployed app (Railway, #88) — they cannot pass against the CI/sandbox.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export interface SpecRun {
  spec: string; // e.g. "e2e/demo-path.spec.ts"
  label: string; // human label for the summary
  marker: string; // console.log prefix the spec emits, e.g. "[demo-path]"
}

export function runSpec({ spec, label, marker }: SpecRun): number {
  const webDir = resolve(import.meta.dirname, "../apps/web");
  const appUrl = process.env.APP_URL;

  console.log(`\n═══ ${label} — E2E verification ═══`);
  if (!appUrl) {
    console.log(
      "✗ APP_URL is not set. These specs run REAL on-chain create/join/finalize/cancel\n" +
        "  transactions and need a deployed Testnet app. Set APP_URL to the Railway URL:\n" +
        `    APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test ${spec}\n` +
        "  See docs/verification/e2e-acceptance.md for the full prerequisites + manual guide.",
    );
    return 2;
  }
  console.log(`APP_URL: ${appUrl}`);
  console.log(`spec   : ${spec}\n`);

  const res = spawnSync("pnpm", ["exec", "playwright", "test", spec], {
    cwd: webDir,
    env: { ...process.env, APP_URL: appUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  process.stdout.write(out);

  const evidence = out
    .split("\n")
    .filter((l) => l.includes(marker))
    .map((l) => l.trim());

  const passed = res.status === 0;
  console.log(`\n─── ${label} evidence ───`);
  if (evidence.length === 0) console.log("(no explorer/tx markers captured)");
  for (const e of evidence) console.log(`  ${e}`);

  console.log(`\n═══ ${label}: ${passed ? "PASS" : "FAIL"} (playwright exit ${res.status}) ═══`);
  return passed ? 0 : 1;
}
