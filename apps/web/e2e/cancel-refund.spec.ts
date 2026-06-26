/**
 * P6.3 (#84) — E2E cancel → refund path.
 *
 * Runs against a deployed Testnet app (`APP_URL`). Creates a tournament, has two
 * players join, then the organiser cancels — asserting the status flips to
 * CANCELLED and each joined player gets a refund row equal to the entry fee.
 *
 *   APP_URL=<deployed-testnet-url> pnpm --filter web exec playwright test e2e/cancel-refund.spec.ts
 *
 * Prereqs: identical to demo-path.spec.ts (deployed app + funded keypairs).
 */
import { test, expect, keypairs } from "./fixtures/wallet";
import { registerAndLogin } from "./fixtures/auth";

const ORG = { user: `e2e-cancel-${Date.now()}`, pass: "Password123!" };
const ENTRY_FEE_XLM = "2";
const SHOT = "test-results/cancel";

test("cancel → refund — status CANCELLED, one refund per player at entry fee", async ({
  page,
  context,
  asWallet,
}) => {
  // ── 1. Organiser session + deploy. ─────────────────────────────────────────
  await registerAndLogin(context, ORG.user, ORG.pass);
  await asWallet("organizer");
  await page.goto("/tournaments/new");
  await page.getByLabel("Tournament Name").fill("E2E Cancel Cup");
  await page.getByLabel("Game Title").fill("Refund Arena");
  await page.getByLabel(/Entry Fee/).fill(ENTRY_FEE_XLM);
  await page.getByLabel("Referee Wallet Address").fill(keypairs.referee.public);
  await page.getByRole("button", { name: "Connect Wallet" }).click();
  await page.getByRole("button", { name: "Deploy Soroban Contract" }).click();
  // Exclude `/tournaments/new`: the deploy is still on the create page here, and
  // a bare `[a-z0-9]+` would match "new" and capture the wrong URL (see #89).
  await page.waitForURL(/\/tournaments\/(?!new$)[a-z0-9]+$/, { timeout: 120_000 });
  const detailUrl = page.url();
  await expect(page.getByTestId("status-chip")).toHaveText("ACTIVE", { timeout: 120_000 });

  // ── 2. Two players join. ───────────────────────────────────────────────────
  for (const role of ["player1", "player2"] as const) {
    await asWallet(role);
    await page.goto(detailUrl);
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await page.getByRole("button", { name: "Join Tournament" }).click();
    await page
      .getByRole("button", { name: "Close" })
      .click({ timeout: 120_000 })
      .catch(() => {});
  }
  // Participant rows are subscriber-ingested a few seconds after each join, so
  // reload-poll until both land rather than asserting one early render.
  await expect(async () => {
    await page.goto(detailUrl);
    await expect(page.getByTestId("participant-row")).toHaveCount(2);
  }).toPass({ timeout: 150_000 });
  await page.screenshot({ path: `${SHOT}-1-two-joined.png`, fullPage: true });

  // ── 3. Organiser cancels (cancel-button → confirm-cancel dialog → sign). ───
  await asWallet("organizer");
  await page.goto(detailUrl);
  await page.getByTestId("cancel-button").click();
  await expect(page.getByTestId("confirm-cancel")).toBeVisible();
  await page.screenshot({ path: `${SHOT}-2-confirm-dialog.png`, fullPage: true });
  await page.getByTestId("confirm-cancel").click();
  // The cancel signs + submits on-chain; the page refreshes to CANCELLED.

  // ── 4. Assert CANCELLED status + one refund row per player at entry fee. ───
  // Wait for the cancel to submit and the page to refresh to CANCELLED in-place
  // (CancelButton calls router.refresh on success) — do NOT reload here, since
  // navigating away would abort the in-flight cancel submission.
  await expect(page.getByTestId("status-chip")).toHaveText("CANCELLED", { timeout: 120_000 });
  // Refund rows are subscriber-ingested from the on-chain `cancelled` event;
  // reload-poll until both land.
  await expect(async () => {
    await page.goto(detailUrl);
    await expect(page.getByTestId("refund-row")).toHaveCount(2);
  }).toPass({ timeout: 150_000 });
  // Each refund equals the entry fee (2.0000000 XLM).
  await expect(page.getByTestId("refund-row").first()).toContainText(
    `${Number(ENTRY_FEE_XLM).toFixed(7)} XLM`,
  );
  await page.screenshot({ path: `${SHOT}-3-cancelled-refunds.png`, fullPage: true });

  // Log refund context for the record (refund tx hashes live in the LiveFeed +
  // on Stellar.Expert under the contract's operations).
  console.log(
    `[cancel-refund] tournament ${detailUrl} CANCELLED with 2 refunds @ ${ENTRY_FEE_XLM} XLM`,
  );
});
