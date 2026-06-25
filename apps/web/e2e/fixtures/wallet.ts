import { test as base } from "@playwright/test";
import { Keypair, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import type { BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";

type Keys = Record<string, { public: string; secret: string }>;
const keys: Keys = JSON.parse(readFileSync(".e2e/keys.json", "utf8"));
const PASSPHRASE = process.env.NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";

// `context.exposeFunction` throws if the same name is bound twice on a context.
// `asWallet` may be called several times per test (switching roles), so we bind
// the Node-side signer exactly once per context and track that here.
const signerBound = new WeakSet<BrowserContext>();

/**
 * Why a stub: the Freighter browser extension cannot load in headless Chromium
 * and exposes no programmatic signing API outside its popup. Phase 4d's client
 * code calls @stellar/freighter-api, which reads `window.freighterApi`. This
 * fixture injects a `window.freighterApi`-shaped object via `addInitScript`
 * BEFORE app JS runs, backed by a real Testnet Keypair — so signing is genuine
 * (real XDR, real network submission) while only the extension prompt is
 * replaced. The actual signing happens in Node via `exposeFunction` (the SDK
 * runs server-side in the fixture); the page only forwards unsigned XDR and
 * receives signed XDR — exactly Phase 4d's contract.
 */
export const test = base.extend<{ asWallet: (role: keyof Keys) => Promise<void> }>({
  asWallet: async ({ context }, use) => {
    const install = async (role: keyof Keys) => {
      const k = keys[role];
      if (!k) throw new Error(`unknown wallet role: ${String(role)}`);

      // Bind the real signer in Node context exactly once per browser context.
      if (!signerBound.has(context)) {
        signerBound.add(context);
        await context.exposeFunction(
          "__GGG_SIGN_XDR__",
          (xdr: string, secret: string, passphrase: string) => {
            const tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
            tx.sign(Keypair.fromSecret(secret));
            return tx.toXDR();
          },
        );
      }

      // Injected before app JS; mirrors the @stellar/freighter-api surface.
      // Re-running addInitScript stacks scripts; the most recent role wins on the
      // next navigation, which is what switching roles between steps expects.
      await context.addInitScript(
        ({ pub, secret, passphrase }) => {
          const w = window as unknown as Record<string, unknown>;
          w.__GGG_E2E_SIGN__ = { pub, secret, passphrase };
          w.freighterApi = {
            isConnected: async () => ({ isConnected: true }),
            requestAccess: async () => ({ address: pub }),
            getAddress: async () => ({ address: pub }),
            getNetwork: async () => ({ network: "TESTNET", networkPassphrase: passphrase }),
            signTransaction: async (xdr: string) => {
              const sign = w.__GGG_SIGN_XDR__ as (
                xdr: string,
                secret: string,
                passphrase: string,
              ) => Promise<string>;
              return { signedTxXdr: await sign(xdr, secret, passphrase) };
            },
          };
        },
        { pub: k.public, secret: k.secret, passphrase: PASSPHRASE },
      );
    };
    await use(install);
  },
});

export const keypairs = keys;
export const expect = test.expect;
