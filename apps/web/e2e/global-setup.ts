import { Keypair } from "@stellar/stellar-sdk";
import { mkdirSync, writeFileSync } from "node:fs";

const FRIENDBOT = "https://friendbot.stellar.org";

async function fund(kp: Keypair) {
  const res = await fetch(`${FRIENDBOT}?addr=${kp.publicKey()}`);
  // 400 = account already funded on a previous run; treat as success.
  if (!res.ok && res.status !== 400) {
    throw new Error(`Friendbot failed for ${kp.publicKey()}: ${res.status}`);
  }
}

/**
 * Funds the fixture keypairs (organizer, referee, three players) via Friendbot
 * once per run and persists them to .e2e/keys.json for the wallet fixture.
 * These are throwaway Testnet accounts — no mainnet value.
 */
export default async function globalSetup() {
  const roles = ["organizer", "referee", "player1", "player2", "player3"] as const;
  const keys: Record<string, { public: string; secret: string }> = {};
  for (const role of roles) {
    const kp = Keypair.random();
    await fund(kp);
    keys[role] = { public: kp.publicKey(), secret: kp.secret() };
  }
  mkdirSync(".e2e", { recursive: true });
  writeFileSync(".e2e/keys.json", JSON.stringify(keys, null, 2));
}
