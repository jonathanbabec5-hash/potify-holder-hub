# POTIFY Holder Hub — independent beta

A real, locally runnable **standalone** POTIFY community app built without Replit, without token issuance, custody, new chain, bridging, spending, payments, or wallet transaction signatures. This code does **not** change the existing POTIFY website and does not include its database or Clerk accounts.

## Working scope

- Wallet-only login with Phantom and Solflare **where compatible browser providers are injected**. A short-lived, single-use signed nonce establishes possession of one Solana wallet. Session cookies are HttpOnly; server checks message signatures cryptographically with Ed25519.
- Server-side **read-only** Solana mainnet token balance lookup of mint `GWdHGomLjqofUSrj3TEhinr2UaRJMzJ5o7MRZLaFpump`. Checks the real mint account owner/program and decimals, aggregates matching token accounts using integer math, shows timestamp and stale/error handling. No zero-balance claim on RPC failures.
- Off-chain Seeds points ledger stored in SQLite with unique event keys; community quests created by wallet-authorized admins; one evidence submission per wallet/quest; admin approve/reject and audit logs; reward idempotency.
- Responsive dashboard, account status, existing POTIFY ecosystem descriptions, and transparent distinctions between features here and those only available on the original site.
- Secure defaults: no hardcoded admin credential; absent `ADMIN_WALLETS` means no admin access. Explicit origin checks on POST, reasonable input limits, basic local rate limits, CSP, cookie protections.

## Run

Requires Node.js 22.13 or newer. This uses Node's built-in SQLite module (still experimental in some Node versions) and requires **no npm install**.

1. In a terminal, open this folder, set `SITE_ORIGIN=http://localhost:8787`, optionally set `SOLANA_RPC_URL`, and run `npm start`.
2. Visit `http://localhost:8787` in a browser with the Phantom or Solflare extension available.
3. To create and review community quests, set `ADMIN_WALLETS` to a comma-separated list of real trusted Solana public addresses and restart. Do not enter seed phrases or private keys.
4. For production choose a persistent volume and configure `DATABASE_PATH`, a dedicated protected HTTPS origin in `SITE_ORIGIN`, an RPC provider, and a reverse proxy with rate limiting/TLS. **Do not publish as production without an external security review and wallet-device verification.**
5. Execute tests using `npm test`.

## Known limitations and integration steps

- **Not integrated with your existing POTIFY Website**: Original Clerk identities, prior Seeds balances, Greenhouse, Vape God, and promotions are not imported. No original source repository was available. Any future identity or Seeds migration needs a separate audited plan and clear ownership proof.
- Mobile wallet handoff is not fully implemented or tested; use a wallet in-app browser that injects a compatible `signMessage` provider or a supported desktop extension. Do not market this as tested iPhone support yet.
- No automatic holder privileges, token rewards, wallet-based prize entry, staking, transaction signing, swaps, or treasury access. Community quests can be joined without buying tokens.
- Basic per-process rate limiting is not suitable for multi-instance production; a proper gateway/WAF and persistent distributed limiter is recommended.
- SQLite assumes a single writable instance and persistent disk. Serverless installations should use a transactional hosted database instead.
- Admin wallet list and RPC are environment settings; never store private keys. Some wallet implementations may require integration with their documented SDK for mobile.
- Token value is read-only; no ownership/equity or returns implied. Off-chain Seeds are not transferable.

## Verification checklist before going live

- Confirm mainnet mint program/decimals and RPC response for the live asset.
- Run automated tests. Independently review challenge and session handling, DB transactions, rate limiting and API access control.
- On a real desktop browser and iPhone in-wallet browser, test Phantom and Solflare connect, sign-in, sign-out, rejection, and resume flows; no transaction signing should occur.
- Test multiple SPL accounts, mainnet RPC outages, stale balances, new/no-balance wallet, and fake responses.
- Test non-admin access, duplicate quest submissions, repeated review requests, conflicting approvals, and seed ledger reconciliation.
- Confirm preservation of existing routes, Clerk accounts, Greenhouse data, game awards, and existing Seeds **before** linking to production.

## Deployment

This is a portable single-process Node web app. Run it on a VPS or any hosting provider supporting Node 22+, persistent storage, HTTPS, and outbound Solana RPC. Do not try to overwrite the production POTIFY website from this package alone.
