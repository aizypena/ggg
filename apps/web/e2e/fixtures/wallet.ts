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
 * Why a stub: the Freighter browser extension can't load in headless Chromium.
 * `@stellar/freighter-api@6` does NOT read a `window.freighterApi` object — it
 * signals presence via the `window.freighter` boolean (for `isConnected`) and
 * talks to the extension content-script over a `window.postMessage` protocol
 * (`FREIGHTER_EXTERNAL_MSG_REQUEST` → `…_RESPONSE`) for everything else. This
 * fixture sets `window.freighter = true` and installs a postMessage responder
 * that answers those requests from a real Testnet `Keypair` — so signing is
 * genuine (real XDR, real network submission); only the extension popup is
 * replaced. Signing runs in Node via `exposeFunction` (the SDK lives in the
 * fixture, not the page).
 *
 * Note the deliberate `messagedId` key in the response — freighter-api matches
 * responses on that (mis-spelled) field; `messageId` is also set for safety.
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

      // Injected before app JS. Each call overwrites `__GGG_WALLET__` (so the
      // most recent role wins on the next navigation) but installs the single
      // postMessage responder only once — the responder reads the current role
      // dynamically, avoiding duplicate listeners stacking across role switches.
      await context.addInitScript(
        ({ pub, secret, passphrase }) => {
          const w = window as unknown as Record<string, unknown> & {
            postMessage: typeof window.postMessage;
            addEventListener: typeof window.addEventListener;
            location: Location;
          };
          w.freighter = true; // isConnected() short-circuit
          w.__GGG_WALLET__ = { pub, secret, passphrase };
          if (w.__GGG_FREIGHTER_LISTENER__) return;
          w.__GGG_FREIGHTER_LISTENER__ = true;

          w.addEventListener("message", (event: MessageEvent) => {
            const d = event.data as {
              source?: string;
              type?: string;
              messageId?: unknown;
              transactionXdr?: string;
            };
            if (!d || d.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
            const id = d.messageId;
            const cur = w.__GGG_WALLET__ as { pub: string; secret: string; passphrase: string };
            const reply = (fields: Record<string, unknown>) =>
              w.postMessage(
                {
                  source: "FREIGHTER_EXTERNAL_MSG_RESPONSE",
                  messagedId: id, // freighter-api matches on this (sic)
                  messageId: id,
                  apiError: null,
                  error: null,
                  ...fields,
                },
                w.location.origin,
              );

            switch (d.type) {
              case "REQUEST_ACCESS":
              case "REQUEST_PUBLIC_KEY":
                reply({ publicKey: cur.pub });
                break;
              case "REQUEST_CONNECTION_STATUS":
                reply({ isConnected: true });
                break;
              case "REQUEST_NETWORK":
                reply({ network: "TESTNET", networkPassphrase: cur.passphrase });
                break;
              case "REQUEST_NETWORK_DETAILS":
                // freighter-api reads these from a nested `networkDetails` object.
                reply({
                  networkDetails: {
                    network: "TESTNET",
                    networkName: "Test Net",
                    networkUrl: "https://horizon-testnet.stellar.org",
                    networkPassphrase: cur.passphrase,
                    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
                  },
                });
                break;
              case "SUBMIT_TRANSACTION": {
                const sign = w.__GGG_SIGN_XDR__ as (
                  xdr: string,
                  secret: string,
                  passphrase: string,
                ) => Promise<string>;
                void sign(d.transactionXdr ?? "", cur.secret, cur.passphrase).then((signed) =>
                  reply({ signedTransaction: signed, signerAddress: cur.pub }),
                );
                break;
              }
              default:
                break;
            }
          });
        },
        { pub: k.public, secret: k.secret, passphrase: PASSPHRASE },
      );
    };
    await use(install);
  },
});

export const keypairs = keys;
export const expect = test.expect;
