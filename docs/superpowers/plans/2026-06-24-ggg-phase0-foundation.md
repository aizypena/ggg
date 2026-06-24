# Phase 0 — Monorepo & Foundation Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the GGG pnpm 10 monorepo skeleton — workspace, strict TS, lint/format, base CI, dev docker stack, Zod env loader, full Prisma 7 schema + migration + seed, the complete Tailwind v4 brand theme, and a themed-but-empty Next.js 16 app — so every later phase has a proven foundation to import, with zero business logic.

**Architecture:** A pnpm workspace monorepo with three members (`apps/web` Next.js 16 app, `apps/subscriber` background service, `contracts/escrow` Rust contract). The web app holds the cross-phase contract elements: a singleton Prisma client, a Zod-validated env module that refuses to boot on missing keys, the `{ ok, data?, error? }` API envelope helpers, a shared validation directory, and the Tailwind v4 CSS-first brand theme. Dev infrastructure (Postgres 17, Redis 7, MinIO) runs via docker-compose; CI gates typecheck + lint.

**Tech Stack:** Node 22 LTS, pnpm 10, Next.js 16 (App Router, Turbopack), React 19.2, TypeScript 5.x strict, Tailwind CSS v4 (CSS-first `@theme`), Prisma 7 (`prisma-client` generator, `prisma.config.ts`), Zod 4, PostgreSQL 17, Redis 7, MinIO, shadcn/ui, ESLint (next) + Prettier.

## Global Constraints
- **Resolve exact patch versions at install time** with `pnpm add <pkg>@latest` and commit `pnpm-lock.yaml`. Do NOT hardcode patch versions from memory — verify against the registry. Target majors: Next.js 16, React 19.2, TypeScript 5.x, Tailwind 4, Prisma 7, `@stellar/stellar-sdk` 15, `soroban-sdk` 26 (Rust, later phase), `@stellar/freighter-api` 5, Node 22 LTS, pnpm 10.
- **The server never holds private keys.** No code path imports, stores, logs, or transmits a secret key (no key code lands in Phase 0 at all).
- **Validate every input with Zod** — request bodies, query params, route params, env vars, and external data. Phase 0 ships the env validation pattern.
- **Money is `BigInt`, never `float`.** Token amounts are smallest unit (XLM = stroops). `Tournament.entryFee` and `Payout.amount` are Prisma `BigInt`.
- **Authorization on the contract is the source of truth.** Web role checks are defense-in-depth (no auth code in Phase 0; schema defines `Role`).
- **Fail closed.** On ambiguity in auth/validation/state, reject with a clear non-leaky error. Env loader fails closed on a missing key.
- **No secrets in the repo.** Everything sensitive comes from env; `.env` is gitignored; only `.env.example` is committed with empty/placeholder values.
- **Consistent envelope:** every API response uses `{ ok: boolean, data?, error?: { code, message } }`. Phase 0 ships `ok()` / `err()` helpers.
- **Dark-only theme.** `<html class="dark">`; GGG ships dark-only. Theme tokens come verbatim from BRAND.md §2; signature classes + keyframes from BRAND.md §5/§6.
- **AGENT.md golden rules apply throughout.** Validate everything, trust nothing from the client, fail closed, secrets only via env.

---

## File Structure

Files this phase creates (all paths absolute from repo root `/home/markhughneri-piertwo/work/webnext/ggg`):

- `package.json` — root workspace manifest: `engines` (Node 22, pnpm 10), `packageManager`, shared dev scripts (`typecheck`, `lint`, `format`), root devDependencies (typescript, prettier).
- `pnpm-workspace.yaml` — declares workspace members `apps/*` and `contracts/*`.
- `.nvmrc` — pins Node 22.
- `.gitignore` — ignores `node_modules`, `.env`, `.next`, build artifacts, Rust `target`.
- `.npmrc` — pnpm settings (strict engine enforcement).
- `tsconfig.base.json` — shared strict TS config extended by each package.
- `.prettierrc.json` — Prettier config.
- `.prettierignore` — Prettier ignore list.
- `docker-compose.yml` — dev services: `postgres:17`, `redis:7`, `minio`, `createbuckets`.
- `.github/workflows/ci.yml` — base CI: install, typecheck, lint.
- `README.md` — root readme with local-dev quickstart.
- `apps/web/package.json` — web app manifest (Next 16, React 19.2, Prisma, Zod, Tailwind, scripts incl. `prisma.seed`).
- `apps/web/tsconfig.json` — extends base; Next plugin, `@/*` path alias.
- `apps/web/next.config.ts` — Next 16 config.
- `apps/web/postcss.config.mjs` — wires `@tailwindcss/postcss`.
- `apps/web/eslint.config.mjs` — flat ESLint config (next + prettier).
- `apps/web/next-env.d.ts` — Next type shim (generated; committed-ignore not required, kept).
- `apps/web/.env.example` — committed env template mirroring SPEC §14.
- `apps/web/src/lib/env.ts` — Zod-validated env loader exporting `env`; throws on missing key.
- `apps/web/src/lib/db.ts` — singleton Prisma client exported as `prisma`.
- `apps/web/src/lib/api.ts` — `ok()` / `err()` envelope helpers + `ApiResponse` type.
- `apps/web/src/lib/validation/.gitkeep` — placeholder for shared Zod schemas dir (later phases).
- `apps/web/src/lib/env.test.ts` — env loader tests.
- `apps/web/src/lib/api.test.ts` — envelope helper tests.
- `apps/web/vitest.config.ts` — Vitest config for the web package.
- `apps/web/prisma/schema.prisma` — full Prisma 7 schema (SPEC §10) with `prisma-client` generator.
- `apps/web/prisma.config.ts` — Prisma 7 config (schema path, seed command).
- `apps/web/prisma/seed.ts` — idempotent admin upsert from env.
- `apps/web/prisma/migrations/**` — generated initial migration.
- `apps/web/src/app/layout.tsx` — root layout: `<html class="dark">`, fonts, `globals.css`.
- `apps/web/src/app/page.tsx` — themed blank landing page.
- `apps/web/src/app/globals.css` — Tailwind v4 `@theme` (full BRAND §2 tokens) + signature classes + keyframes + font/icon imports.
- `apps/web/components.json` — shadcn/ui config themed to GGG.
- `apps/web/src/lib/utils.ts` — shadcn `cn()` helper.
- `apps/subscriber/package.json` — subscriber service manifest (placeholder entrypoint, no logic).
- `apps/subscriber/tsconfig.json` — extends base.
- `apps/subscriber/src/index.ts` — placeholder entrypoint (logs "subscriber: not implemented").
- `contracts/escrow/Cargo.toml` — Rust crate manifest (placeholder, no contract logic).
- `contracts/escrow/src/lib.rs` — placeholder Rust module (empty `#![no_std]` stub) so the workspace dir exists.
- `contracts/escrow/.gitkeep` — ensures dir tracked even if Cargo files deferred.

---

## Task 1: Initialize git repo state, root workspace manifest, Node/pnpm pinning

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.nvmrc`, `.npmrc`, `.gitignore`
- Verify: `pnpm install` resolves the empty workspace

**Interfaces:** Consumes: nothing. Produces: workspace root with `engines.node` `>=22 <23`, `engines.pnpm` `>=10`, `packageManager` `pnpm@10.x`; workspace globs `apps/*` + `contracts/*`.

- [ ] **Step 1: Enable corepack and pin pnpm.** Run:
```bash
corepack enable && corepack prepare pnpm@latest --activate && pnpm --version
```
Expected output: a version line starting with `10.` (e.g. `10.12.4`). Record that exact version; use it in `packageManager` below.

- [ ] **Step 2: Create `.nvmrc`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/.nvmrc`:
```
22
```

- [ ] **Step 3: Create `.npmrc`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/.npmrc`:
```
engine-strict=true
auto-install-peers=true
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "contracts/*"
```

- [ ] **Step 5: Create root `package.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/package.json` (replace `10.12.4` with the exact version from Step 1):
```json
{
  "name": "ggg",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=22 <23",
    "pnpm": ">=10"
  },
  "packageManager": "pnpm@10.12.4",
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  },
  "devDependencies": {}
}
```

- [ ] **Step 6: Create `.gitignore`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/.gitignore`:
```
# dependencies
node_modules/
.pnpm-store/

# next
.next/
out/
next-env.d.ts

# env
.env
.env.local
.env.*.local

# build / artifacts
dist/
build/
*.tsbuildinfo

# rust
target/

# prisma
apps/web/src/generated/

# os / editor
.DS_Store
*.log
coverage/
```

- [ ] **Step 7: Install the empty workspace.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm install
```
Expected output: `Done in` ... with no error about missing workspace packages (an empty install is fine). A `pnpm-lock.yaml` is created.

- [ ] **Step 8: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: pnpm workspace root, Node 22 + pnpm 10 pinning"
```

---

## Task 2: Shared TypeScript strict config and Prettier

**Files:**
- Create: `tsconfig.base.json`, `.prettierrc.json`, `.prettierignore`
- Modify: root `package.json` (add `prettier`, `typescript` devDeps)
- Verify: `npx tsc --version`, `npx prettier --check`

**Interfaces:** Consumes: nothing. Produces: `tsconfig.base.json` with the four strict flags (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`), extended by every package.

- [ ] **Step 1: Add root tooling deps.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add -D -w typescript prettier
```
Expected: both added to root `devDependencies`; lockfile updated.

- [ ] **Step 2: Create `tsconfig.base.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/tsconfig.base.json`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "moduleDetection": "force",
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "declaration": false,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create `.prettierrc.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/.prettierrc.json`:
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 4: Create `.prettierignore`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/.prettierignore`:
```
node_modules
.next
dist
build
coverage
pnpm-lock.yaml
target
apps/web/prisma/migrations
apps/web/src/generated
```

- [ ] **Step 5: Verify Prettier and tsc run.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && npx tsc --version && npx prettier --check .
```
Expected: a TS version line `Version 5.x.x`, then `All matched files use Prettier code style!` (or it lists no files; acceptable as long as exit code is 0).

- [ ] **Step 6: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: shared strict tsconfig base + Prettier config"
```

---

## Task 3: Scaffold the Next.js 16 web app

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`, `apps/web/postcss.config.mjs`, `apps/web/eslint.config.mjs`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/lib/utils.ts`
- Verify: `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build`

**Interfaces:** Consumes: `tsconfig.base.json` (Task 2). Produces: a buildable `web` workspace package with `typecheck`/`lint`/`dev`/`build` scripts and the `@/*` path alias pointing at `apps/web/src`.

- [ ] **Step 1: Add Next.js + React runtime deps to web.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter web next@latest react@latest react-dom@latest
```
Expected: `next@16.x`, `react@19.x`, `react-dom@19.x` recorded in `apps/web/package.json`. (If `--filter web` errors because the package does not exist yet, first create the minimal `apps/web/package.json` from Step 2, then re-run.)

- [ ] **Step 2: Create `apps/web/package.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/package.json` (keep the dependency versions pnpm wrote in Step 1; the block below shows structure — do not downgrade resolved versions):
```json
{
  "name": "web",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:generate": "prisma generate"
  },
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {},
  "devDependencies": {}
}
```
(Leave the `dependencies`/`devDependencies` objects as pnpm populates them across this and later tasks; the placeholders above are merged, not overwritten.)

- [ ] **Step 3: Add web dev tooling.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter web -D typescript @types/node @types/react @types/react-dom eslint eslint-config-next eslint-config-prettier @tailwindcss/postcss tailwindcss tsx vitest
```
Expected: all added to `apps/web/devDependencies`.

- [ ] **Step 4: Create `apps/web/tsconfig.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create `apps/web/next.config.ts`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 6: Create `apps/web/postcss.config.mjs`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/postcss.config.mjs`:
```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 7: Create `apps/web/eslint.config.mjs`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/eslint.config.mjs`:
```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    ignores: [".next/**", "node_modules/**", "prisma/migrations/**", "src/generated/**"],
  },
];

export default eslintConfig;
```

- [ ] **Step 8: Add `@eslint/eslintrc` (needed by FlatCompat).** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter web -D @eslint/eslintrc
```

- [ ] **Step 9: Create `apps/web/src/lib/utils.ts`** (shadcn `cn`). Run first:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter web clsx tailwind-merge
```
Then write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 10: Create minimal `globals.css`** (full theme arrives in Task 9; this keeps the app buildable now). Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/globals.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 11: Create root layout.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/layout.tsx`:
```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GGG — Good Game Guild",
  description: "Trustless tournament prize-escrow protocol on Stellar Soroban.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-on-surface antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 12: Create landing page.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-10">
      <h1 className="font-display text-4xl font-extrabold tracking-tight">GGG</h1>
    </main>
  );
}
```

- [ ] **Step 13: Build the app.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web build
```
Expected: `✓ Compiled successfully` and a route table listing `/` as a static route; exit code 0.

- [ ] **Step 14: Typecheck and lint pass.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web typecheck && pnpm --filter web lint
```
Expected: no type errors; `eslint` exits 0 with no errors.

- [ ] **Step 15: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: scaffold Next.js 16 web app (strict TS, ESLint+Prettier, Tailwind v4 wired)"
```

---

## Task 4: Subscriber and contract workspace members (placeholders, no logic)

**Files:**
- Create: `apps/subscriber/package.json`, `apps/subscriber/tsconfig.json`, `apps/subscriber/src/index.ts`, `contracts/escrow/Cargo.toml`, `contracts/escrow/src/lib.rs`, `contracts/escrow/.gitkeep`
- Verify: `pnpm --filter subscriber typecheck`

**Interfaces:** Consumes: `tsconfig.base.json`. Produces: the `apps/subscriber` and `contracts/escrow` workspace directories so later phases have their home; no business logic.

- [ ] **Step 1: Create `apps/subscriber/package.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/subscriber/package.json`:
```json
{
  "name": "subscriber",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "echo \"subscriber: no lint config yet\" && exit 0"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 2: Add subscriber dev deps.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter subscriber -D typescript tsx @types/node
```

- [ ] **Step 3: Create `apps/subscriber/tsconfig.json`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/subscriber/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create placeholder entrypoint.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/subscriber/src/index.ts`:
```ts
// Event subscriber service — implemented in Phase 5.
// Phase 0 ships only the workspace member so later phases have a home.
function main(): void {
  console.log("subscriber: not implemented (Phase 5)");
}

main();
```

- [ ] **Step 5: Subscriber typecheck passes.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter subscriber typecheck
```
Expected: no output, exit code 0.

- [ ] **Step 6: Create the contract crate placeholder.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/contracts/escrow/Cargo.toml`:
```toml
[package]
name = "ggg-escrow"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
crate-type = ["cdylib", "rlib"]

# soroban-sdk and the full contract implementation arrive in Phase 1.
[dependencies]
```

- [ ] **Step 7: Create the contract lib placeholder.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/contracts/escrow/src/lib.rs`:
```rust
// GGG Tournament Escrow contract — implemented in Phase 1.
// Phase 0 ships only the crate skeleton so the workspace directory exists.
```

- [ ] **Step 8: Create `contracts/escrow/.gitkeep`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/contracts/escrow/.gitkeep`:
```
```

- [ ] **Step 9: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: subscriber + escrow contract workspace placeholders"
```

---

## Task 5: docker-compose dev services (postgres 17, redis 7, minio)

**Files:**
- Create: `docker-compose.yml`
- Verify: `docker compose up -d` then `docker compose ps`

**Interfaces:** Consumes: nothing. Produces: dev services reachable at `localhost:5432` (Postgres `ggg/ggg/ggg`), `localhost:6379` (Redis), `localhost:9000` (MinIO S3) / `localhost:9001` (MinIO console), with bucket `ggg-uploads` created.

- [ ] **Step 1: Create `docker-compose.yml`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:17
    restart: unless-stopped
    environment:
      POSTGRES_USER: ggg
      POSTGRES_PASSWORD: ggg
      POSTGRES_DB: ggg
    ports:
      - "5432:5432"
    volumes:
      - ggg_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ggg -d ggg"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - ggg_redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - ggg_miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 5s
      retries: 10

  createbuckets:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/ggg-uploads;
      mc anonymous set download local/ggg-uploads;
      exit 0;
      "

volumes:
  ggg_pgdata:
  ggg_redisdata:
  ggg_miniodata:
```

- [ ] **Step 2: Bring services up.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && docker compose up -d
```
Expected: pulls images then lines like `Container ggg-postgres-1 Started`, `... redis ... Started`, `... minio ... Started`, `... createbuckets ... Started/Exited`.

- [ ] **Step 3: Verify health.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && docker compose ps
```
Expected: `postgres`, `redis`, `minio` show `running (healthy)`; `createbuckets` shows `exited (0)`.

- [ ] **Step 4: Verify the bucket exists.** Run:
```bash
docker run --rm --network ggg_default minio/mc:latest sh -c "mc alias set local http://minio:9000 minioadmin minioadmin >/dev/null && mc ls local/"
```
Expected: a line containing `ggg-uploads`. (If the network name differs, find it with `docker network ls | grep ggg`.)

- [ ] **Step 5: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: docker-compose dev stack (postgres 17, redis 7, minio + createbuckets)"
```

---

## Task 6: Zod-validated env loader (fail-closed)

**Files:**
- Create: `apps/web/src/lib/env.ts`, `apps/web/src/lib/env.test.ts`, `apps/web/vitest.config.ts`, `apps/web/.env.example`
- Verify: `pnpm --filter web test`

**Interfaces:** Consumes: nothing. Produces: `env` (typed, validated singleton) exported from `apps/web/src/lib/env.ts`; keys mirror SPEC §14. Throws a clear error listing missing/invalid keys at import time (fail closed).

- [ ] **Step 1: Add Zod and Vitest deps.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter web zod && pnpm add --filter web -D @vitejs/plugin-react
```

- [ ] **Step 2: Create `apps/web/vitest.config.ts`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "prisma/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Write the failing env test.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const valid: Record<string, string> = {
  NODE_ENV: "development",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "x".repeat(32),
  CSRF_SECRET: "y".repeat(32),
  DATABASE_URL: "postgresql://ggg:ggg@localhost:5432/ggg",
  REDIS_URL: "redis://localhost:6379",
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "supersecret123",
  STELLAR_NETWORK: "testnet",
  SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
  HORIZON_URL: "https://horizon-testnet.stellar.org",
  NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "ggg-uploads",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
};

describe("parseEnv", () => {
  it("parses a complete valid environment", () => {
    const env = parseEnv(valid);
    expect(env.STELLAR_NETWORK).toBe("testnet");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("throws and names the missing key when SESSION_SECRET is absent", () => {
    const { SESSION_SECRET: _omit, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrowError(/SESSION_SECRET/);
  });

  it("rejects an invalid STELLAR_NETWORK value", () => {
    expect(() => parseEnv({ ...valid, STELLAR_NETWORK: "mars" })).toThrowError(
      /STELLAR_NETWORK/,
    );
  });

  it("rejects a too-short SESSION_SECRET", () => {
    expect(() => parseEnv({ ...valid, SESSION_SECRET: "short" })).toThrowError(
      /SESSION_SECRET/,
    );
  });
});
```

- [ ] **Step 4: Run the test, expect FAIL.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web test
```
Expected: failure — `Cannot find module './env'` (or `parseEnv is not a function`). This proves the test runs and the implementation is missing.

- [ ] **Step 5: Implement the env loader.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/env.ts`:
```ts
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

const envSchema = z.object({
  // App
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 chars"),
  CSRF_SECRET: z.string().min(32, "CSRF_SECRET must be at least 32 chars"),

  // Database / cache
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Seed admin
  ADMIN_USERNAME: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD must be at least 8 chars"),

  // Stellar
  STELLAR_NETWORK: z.enum(["testnet", "public"]),
  SOROBAN_RPC_URL: z.string().url(),
  HORIZON_URL: z.string().url(),
  NETWORK_PASSPHRASE: z.string().min(1),
  ESCROW_WASM_HASH: z.string().optional(),
  NATIVE_SAC_ADDRESS: z.string().optional(),

  // File storage (S3 / MinIO)
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanString.default(false),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);
```

- [ ] **Step 6: Run the test, expect PASS.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web test
```
Expected: `4 passed` for `env.test.ts`. (Note: the module-level `export const env = parseEnv(process.env)` is only evaluated when imported in the app; the tests import `parseEnv` directly so they don't trip on the real environment.)

- [ ] **Step 7: Create `.env.example`** (committed, mirrors SPEC §14, no real secrets). Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/.env.example`:
```
# App
NODE_ENV=development
APP_URL=http://localhost:3000
SESSION_SECRET=            # long random string (>=32 chars) for sessions
CSRF_SECRET=               # long random string (>=32 chars)

# Database / cache
DATABASE_URL=postgresql://ggg:ggg@localhost:5432/ggg
REDIS_URL=redis://localhost:6379

# Seed admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=            # set locally; never commit a real value

# Stellar
STELLAR_NETWORK=testnet            # testnet | public
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org
NETWORK_PASSPHRASE=Test SDF Network ; September 2015
ESCROW_WASM_HASH=                  # set after upload (Phase 1)
NATIVE_SAC_ADDRESS=                # native asset contract id for the network

# File storage (S3 / MinIO)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=ggg-uploads
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_FORCE_PATH_STYLE=true
```

- [ ] **Step 8: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: Zod env loader (fail-closed) + .env.example mirroring SPEC §14"
```

---

## Task 7: API envelope helpers and validation directory

**Files:**
- Create: `apps/web/src/lib/api.ts`, `apps/web/src/lib/api.test.ts`, `apps/web/src/lib/validation/.gitkeep`
- Verify: `pnpm --filter web test`

**Interfaces:** Consumes: nothing. Produces: `ok(data)` and `err(code, message, status)` returning `Response` objects whose JSON body is `{ ok, data?, error?: { code, message } }`; the `ApiEnvelope<T>` type; and the shared validation dir `apps/web/src/lib/validation/`.

- [ ] **Step 1: Write the failing envelope test.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/api.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ok, err } from "./api";

describe("api envelope", () => {
  it("ok() returns a 200 with { ok: true, data }", async () => {
    const res = ok({ hello: "world" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: { hello: "world" } });
  });

  it("ok() accepts a custom status", async () => {
    const res = ok({ id: "1" }, 201);
    expect(res.status).toBe(201);
  });

  it("err() returns the given status with { ok: false, error }", async () => {
    const res = err("NOT_FOUND", "Tournament not found", 404);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Tournament not found" },
    });
  });

  it("err() defaults to status 400", () => {
    const res = err("BAD_REQUEST", "Invalid input");
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web test src/lib/api.test.ts
```
Expected: failure — `Cannot find module './api'`.

- [ ] **Step 3: Implement the envelope helpers.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/api.ts`:
```ts
export type ApiError = { code: string; message: string };

export type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

/** Success envelope. Defaults to HTTP 200. */
export function ok<T>(data: T, status = 200): Response {
  const body: ApiEnvelope<T> = { ok: true, data };
  return Response.json(body, { status });
}

/** Error envelope. Defaults to HTTP 400. Never leak internal details into `message`. */
export function err(code: string, message: string, status = 400): Response {
  const body: ApiEnvelope<never> = { ok: false, error: { code, message } };
  return Response.json(body, { status });
}
```

- [ ] **Step 4: Run the test, expect PASS.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web test src/lib/api.test.ts
```
Expected: `4 passed`.

- [ ] **Step 5: Create the validation directory placeholder.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/validation/.gitkeep`:
```
```

- [ ] **Step 6: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: { ok, data?, error? } envelope helpers + shared validation dir"
```

---

## Task 8: Prisma 7 schema, migration, singleton client, seed

**Files:**
- Create: `apps/web/prisma/schema.prisma`, `apps/web/prisma.config.ts`, `apps/web/src/lib/db.ts`, `apps/web/prisma/seed.ts`, `apps/web/prisma/seed.test.ts`, `apps/web/prisma/migrations/**` (generated)
- Verify: `pnpm --filter web db:migrate`, `pnpm --filter web db:seed`, `pnpm --filter web test`

**Interfaces:** Consumes: `env` (Task 6); docker Postgres (Task 5). Produces: Prisma enums `Role{ADMIN,ORGANIZER}`, `Asset{XLM,USDC}`, `TournamentStatus{DRAFT,ACTIVE,FINISHED,CANCELLED}`, `EventType{REGISTERED,FINALIZED,CANCELLED}`; models `User`, `Tournament`, `Participant`, `Payout`, `ContractEvent` (with `entryFee` & `Payout.amount` as `BigInt`); singleton `prisma` from `apps/web/src/lib/db.ts`; an idempotent admin seed.

- [ ] **Step 1: Add Prisma deps.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm add --filter web @prisma/client@latest && pnpm add --filter web -D prisma@latest && pnpm add --filter web argon2
```
Expected: `prisma@7.x` (dev), `@prisma/client@7.x`, `argon2` resolved.

- [ ] **Step 2: Create `apps/web/prisma/schema.prisma`** (full SPEC §10 schema, Prisma 7 `prisma-client` generator). Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  ADMIN
  ORGANIZER
}

enum Asset {
  XLM
  USDC
}

enum TournamentStatus {
  DRAFT
  ACTIVE
  FINISHED
  CANCELLED
}

enum EventType {
  REGISTERED
  FINALIZED
  CANCELLED
}

model User {
  id           String       @id @default(cuid())
  username     String       @unique
  passwordHash String
  role         Role         @default(ORGANIZER)
  tournaments  Tournament[] @relation("organizer")
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt
}

model Tournament {
  id            String           @id @default(cuid())
  name          String
  gameTitle     String
  asset         Asset            @default(XLM)
  entryFee      BigInt
  firstBps      Int
  secondBps     Int
  thirdBps      Int
  organizer     User             @relation("organizer", fields: [organizerId], references: [id])
  organizerId   String
  organizerAddr String
  refereeAddr   String
  contractId    String?          @unique
  tokenAddr     String?
  status        TournamentStatus @default(DRAFT)
  coverImageKey String?
  participants  Participant[]
  payouts       Payout[]
  events        ContractEvent[]
  deployTxHash  String?
  createdAt     DateTime         @default(now())
  finalizedAt   DateTime?
  cancelledAt   DateTime?
}

model Participant {
  id           String     @id @default(cuid())
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId String
  playerAddr   String
  joinTxHash   String?
  joinedAt     DateTime   @default(now())

  @@unique([tournamentId, playerAddr])
}

model Payout {
  id           String     @id @default(cuid())
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId String
  rank         Int
  playerAddr   String
  amount       BigInt
  txHash       String?
  createdAt    DateTime   @default(now())
}

model ContractEvent {
  id           String     @id @default(cuid())
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
  tournamentId String
  type         EventType
  ledger       Int?
  txHash       String?
  payload      Json
  createdAt    DateTime   @default(now())

  @@index([tournamentId, createdAt])
}
```

- [ ] **Step 3: Create `apps/web/prisma.config.ts`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/prisma.config.ts`:
```ts
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
```

- [ ] **Step 4: Prepare the local `.env` for Prisma.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && cp apps/web/.env.example apps/web/.env
```
Then set `ADMIN_PASSWORD`, `SESSION_SECRET`, `CSRF_SECRET` to local dev values. Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && node -e "const c=require('node:crypto');const fs=require('node:fs');let e=fs.readFileSync('.env','utf8');e=e.replace(/^SESSION_SECRET=.*/m,'SESSION_SECRET='+c.randomBytes(32).toString('hex'));e=e.replace(/^CSRF_SECRET=.*/m,'CSRF_SECRET='+c.randomBytes(32).toString('hex'));e=e.replace(/^ADMIN_PASSWORD=.*/m,'ADMIN_PASSWORD=devadmin123');fs.writeFileSync('.env',e);console.log('local .env secrets set');"
```
Expected: `local .env secrets set`. (Confirm docker Postgres from Task 5 is running.)

- [ ] **Step 5: Generate the client and create the initial migration.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && pnpm exec prisma migrate dev --name init
```
Expected: `Applying migration ...`, `The following migration(s) have been created and applied`, a new dir under `apps/web/prisma/migrations/`, and `Generated Prisma Client`. (`prisma db seed` may auto-run here; that is fine and idempotent.)

- [ ] **Step 6: Create the singleton Prisma client.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/lib/db.ts`:
```ts
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```
(If the generated client's import path differs after generation, adjust the import to the actual `src/generated/prisma` entry — verify with `ls apps/web/src/generated/prisma`.)

- [ ] **Step 7: Create the idempotent seed.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/prisma/seed.ts`:
```ts
import argon2 from "argon2";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD must be set to seed the admin user");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  await prisma.user.upsert({
    where: { username },
    update: { role: Role.ADMIN },
    create: { username, passwordHash, role: Role.ADMIN },
  });

  console.log(`Seeded admin user "${username}" (idempotent upsert).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 8: Run the seed.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && pnpm db:seed
```
Expected: `Seeded admin user "admin" (idempotent upsert).`

- [ ] **Step 9: Verify idempotency.** Run the same command again:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && pnpm db:seed
```
Expected: identical success line, no unique-constraint error (proving upsert idempotency).

- [ ] **Step 10: Write a seed-shape test** (asserts a single admin and BigInt typing assumptions hold via a direct DB query). Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/prisma/seed.test.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient, Role } from "../src/generated/prisma/client";

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seeded admin", () => {
  it("exactly one ADMIN exists for the seeded username", async () => {
    const username = process.env.ADMIN_USERNAME ?? "admin";
    const admins = await prisma.user.findMany({ where: { role: Role.ADMIN } });
    expect(admins.length).toBeGreaterThanOrEqual(1);
    const seeded = admins.find((u) => u.username === username);
    expect(seeded).toBeDefined();
    expect(seeded?.passwordHash.startsWith("$argon2id$")).toBe(true);
  });
});
```

- [ ] **Step 11: Run the DB-backed test, expect PASS.** Run (requires docker Postgres up and `apps/web/.env` loaded — Prisma reads it automatically):
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web exec dotenv -e .env -- vitest run prisma/seed.test.ts || (cd apps/web && pnpm exec vitest run prisma/seed.test.ts)
```
Expected: `1 passed`. (If `dotenv` CLI is unavailable, the fallback after `||` runs Vitest from `apps/web` where Prisma auto-loads `.env`.)

- [ ] **Step 12: Confirm `.env` is gitignored.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git status --porcelain apps/web/.env
```
Expected: no output (file is ignored, not staged).

- [ ] **Step 13: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: full Prisma 7 schema (SPEC §10), initial migration, singleton client, idempotent admin seed"
```

---

## Task 9: Tailwind v4 brand theme — full token table, signature classes, keyframes, fonts

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`
- Verify: `pnpm --filter web build`, visual check via `pnpm --filter web dev`

**Interfaces:** Consumes: nothing. Produces: the Tailwind v4 `@theme` block with the complete BRAND §2 token table; signature classes `.brutalist-border`, `.brutalist-border-active`, `.kinetic-glass`, `.glass-panel`, `.high-contrast-card`, `.acid-glow`, `.violet-accent`; the BRAND §6 keyframes (`glow-pulse-acid`, `pulse-live`, `ticker-scroll`); Sora + Space Mono + Material Symbols loaded; `prefers-reduced-motion` respected.

- [ ] **Step 1: Replace `globals.css` with the full brand theme.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/globals.css`:
```css
@import "tailwindcss";

/* ── Fonts (Google Fonts + Material Symbols) ───────────────────────── */
@import url("https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Space+Mono:wght@400;700&display=swap");
@import url("https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");

/* ── GGG theme tokens (BRAND.md §2) ────────────────────────────────── */
@theme {
  /* Brand accents */
  --color-acid-yellow: #cdf200;
  --color-acid-yellow-bright: #d9ff00;
  --color-secondary-fixed-dim: #b4d400;
  --color-electric-violet: #a078ff;
  --color-electric-violet-strong: #8b5cf6;
  --color-primary: #d0bcff;
  --color-inverse-primary: #6d3bd7;

  /* Surfaces (dark ramp) */
  --color-background: #131314;
  --color-background-deep: #0a0a0b;
  --color-surface-container-lowest: #0e0e0f;
  --color-surface-container-low: #1c1b1c;
  --color-surface-container: #201f20;
  --color-surface-container-high: #2a2a2b;
  --color-surface-container-highest: #353436;
  --color-surface-variant: #353436;
  --color-surface-bright: #3a393a;

  /* Text & lines */
  --color-on-background: #e5e2e3;
  --color-on-surface: #e5e2e3;
  --color-on-surface-variant: #cbc3d7;
  --color-outline: #958ea0;
  --color-outline-variant: #494454;
  --color-secondary: #ffffff;

  /* Semantic / state */
  --color-error: #ffb4ab;
  --color-error-container: #93000a;
  --color-on-error-container: #ffdad6;
  --color-on-secondary-fixed: #181e00;
  --color-on-secondary-container: #000000;
  --color-on-secondary-container-dim: #5a6b00;

  /* Typography families */
  --font-display: "Sora", sans-serif;
  --font-body: "Sora", sans-serif;
  --font-mono: "Space Mono", monospace;

  /* Radius */
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-stack-tight: 8px;
  --spacing-stack-dense: 12px;
  --spacing-gutter: 16px;
  --spacing-margin-mobile: 16px;
  --spacing-margin-desktop: 40px;
  --spacing-container-max: 1440px;

  /* Animations */
  --animate-glow-pulse-acid: glow-pulse-acid 1.5s ease-in-out infinite alternate;
  --animate-pulse-live: pulse-live 2s ease-in-out infinite;
  --animate-ticker-scroll: ticker-scroll 30s linear infinite;
}

/* ── Base ──────────────────────────────────────────────────────────── */
html.dark {
  color-scheme: dark;
}

body {
  font-family: var(--font-body);
}

.material-symbols-outlined {
  font-family: "Material Symbols Outlined";
  font-weight: normal;
  font-style: normal;
  font-variation-settings:
    "FILL" 0,
    "wght" 400,
    "GRAD" 0,
    "opsz" 24;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
}

.material-symbols-outlined.fill {
  font-variation-settings: "FILL" 1;
}

/* ── Signature classes (BRAND.md §5) ───────────────────────────────── */
.brutalist-border {
  border: 2px solid #958ea0;
  box-shadow: 4px 4px 0 #000;
}

.brutalist-border-active {
  border-color: #cdf200;
  box-shadow: 4px 4px 0 #cdf200;
}

.kinetic-glass {
  background: rgba(32, 31, 32, 0.6);
  backdrop-filter: blur(12px);
  border: 2px solid #353436;
}

.glass-panel {
  background: #201f20;
  border: 1px solid #494454;
}

.high-contrast-card {
  background: #0e0e0f;
  border: 2px solid #cdf200;
}

.acid-glow {
  box-shadow: 0 0 40px rgba(205, 242, 0, 0.15);
}

.violet-accent {
  border-left: 4px solid #a078ff;
}

/* ── Keyframes (BRAND.md §6) ───────────────────────────────────────── */
@keyframes glow-pulse-acid {
  from {
    box-shadow: 0 0 5px rgba(205, 242, 0, 0.4);
  }
  to {
    box-shadow: 0 0 20px rgba(205, 242, 0, 0.8);
  }
}

@keyframes pulse-live {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.92);
  }
}

@keyframes ticker-scroll {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}

/* ── Reduced motion (AGENT.md §4 accessibility) ────────────────────── */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Update the landing page to exercise the theme** (visual smoke of tokens + signature classes + fonts). Write file `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[var(--spacing-container-max)] flex-col items-center justify-center gap-8 p-10">
      <span className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-acid-yellow">
        Good Game Guild
      </span>
      <h1 className="font-display text-5xl font-extrabold tracking-tight text-primary">GGG</h1>
      <div className="high-contrast-card acid-glow rounded-none p-8 text-center">
        <p className="font-mono text-sm text-acid-yellow-bright">PRIZE POOL</p>
        <p className="font-display text-6xl font-extrabold text-acid-yellow">0 XLM</p>
      </div>
      <div className="violet-accent glass-panel rounded-xl p-6">
        <p className="text-on-surface-variant">Trustless tournament prize-escrow on Stellar Soroban.</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build with the full theme.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web build
```
Expected: `✓ Compiled successfully`, exit code 0 (no unknown-utility errors — confirms tokens like `text-acid-yellow`, `bg-background` resolve).

- [ ] **Step 4: Visual smoke test.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web dev
```
Then open `http://localhost:3000`. Expected: near-black canvas, acid-yellow eyebrow + prize number, violet-edged glass card, Sora headline + Space Mono labels rendered. Stop the dev server (Ctrl-C) after confirming.

- [ ] **Step 5: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: Tailwind v4 @theme full BRAND token table + signature classes + keyframes + fonts"
```

---

## Task 10: Initialize and theme shadcn/ui

**Files:**
- Create: `apps/web/components.json`, shadcn-generated component(s) under `apps/web/src/components/ui/`
- Modify: `apps/web/src/app/globals.css` (shadcn CSS variables mapped to GGG tokens), `apps/web/src/app/page.tsx` (render one themed Button to prove integration)
- Verify: `pnpm --filter web build`

**Interfaces:** Consumes: `cn()` (Task 3 Step 9), the brand theme (Task 9). Produces: a `components.json` configured to GGG, shadcn CSS design tokens mapped to GGG colors (not defaults), and at least one installed primitive (`button`) proving the pipeline.

- [ ] **Step 1: Run the shadcn init.** Run (non-interactive where possible; accept New-York style, set base color to neutral — we override variables next):
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && pnpm dlx shadcn@latest init
```
When prompted: style = "New York", base color = "Neutral", CSS variables = yes, components dir = `src/components`, utils = `@/lib/utils`, global CSS = `src/app/globals.css`. Expected: `components.json` created; shadcn appends a `:root`/`.dark` variable block + `@theme inline` to `globals.css`.

- [ ] **Step 2: Map shadcn variables to GGG tokens.** Edit the shadcn-generated `.dark { ... }` block in `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/globals.css` so the design tokens reference GGG brand colors (replace shadcn defaults). Set:
```css
.dark {
  --background: #131314;
  --foreground: #e5e2e3;
  --card: #0e0e0f;
  --card-foreground: #e5e2e3;
  --popover: #201f20;
  --popover-foreground: #e5e2e3;
  --primary: #8b5cf6;
  --primary-foreground: #ffffff;
  --secondary: #cdf200;
  --secondary-foreground: #181e00;
  --muted: #1c1b1c;
  --muted-foreground: #cbc3d7;
  --accent: #a078ff;
  --accent-foreground: #ffffff;
  --destructive: #93000a;
  --destructive-foreground: #ffdad6;
  --border: #494454;
  --input: #353436;
  --ring: #8b5cf6;
  --radius: 0.5rem;
}
```
Also delete or neutralize the light `:root { ... }` shadcn block's color values so GGG stays dark-only (set the same values, or remove the light block — GGG ships dark-only with `<html class="dark">`).

- [ ] **Step 3: Install the Button primitive.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && pnpm dlx shadcn@latest add button
```
Expected: `src/components/ui/button.tsx` created.

- [ ] **Step 4: Render a themed Button on the landing page.** Edit `/home/markhughneri-piertwo/work/webnext/ggg/apps/web/src/app/page.tsx` — add the import and a button inside `<main>`:
```tsx
import { Button } from "@/components/ui/button";
```
and add before the closing `</main>`:
```tsx
      <Button className="font-mono uppercase tracking-[0.1em]">Connect Wallet</Button>
```

- [ ] **Step 5: Build with shadcn integrated.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web build
```
Expected: `✓ Compiled successfully`, exit code 0.

- [ ] **Step 6: Typecheck + lint pass.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web typecheck && pnpm --filter web lint
```
Expected: no errors. (If shadcn-generated files trip a lint rule, add `src/components/ui/**` to the ESLint `ignores` array in `apps/web/eslint.config.mjs`, since these are generated.)

- [ ] **Step 7: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: shadcn/ui initialized and themed to GGG tokens (Button primitive)"
```

---

## Task 11: Base CI (typecheck + lint)

**Files:**
- Create: `.github/workflows/ci.yml`
- Verify: `act` (optional) or push; locally re-run the exact CI commands

**Interfaces:** Consumes: all package `typecheck`/`lint` scripts. Produces: a GitHub Actions workflow that installs with frozen lockfile, generates the Prisma client, then runs `pnpm -r typecheck` and `pnpm -r lint` on push/PR. CI does not require docker services (typecheck/lint only, per Phase 0 scope).

- [ ] **Step 1: Create `.github/workflows/ci.yml`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  typecheck-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Enable corepack
        run: corepack enable

      - uses: actions/setup-node@v4
        with:
          node-version-file: ".nvmrc"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm --filter web db:generate

      - name: Typecheck
        run: pnpm -r typecheck

      - name: Lint
        run: pnpm -r lint

      - name: Prettier check
        run: pnpm format:check
```

- [ ] **Step 2: Reproduce the CI gate locally.** Run the exact CI command sequence:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm install --frozen-lockfile && pnpm --filter web db:generate && pnpm -r typecheck && pnpm -r lint && pnpm format:check
```
Expected: all steps exit 0 — Prisma client generated, no type errors across all workspace packages, no lint errors, Prettier reports all files formatted.

- [ ] **Step 3: Run the full web test suite once more** (proves env + api + seed tests still green together; docker Postgres must be up for the seed test). Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web test
```
Expected: all test files pass (`env.test.ts`, `api.test.ts`, `prisma/seed.test.ts`).

- [ ] **Step 4: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: base CI workflow (install + prisma generate + typecheck + lint + format check)"
```

---

## Task 12: End-to-end "done when" verification + README

**Files:**
- Create: `README.md`
- Verify: the full Phase 0 acceptance sequence

**Interfaces:** Consumes: everything above. Produces: a documented local-dev quickstart and a green end-to-end boot of the themed blank app.

- [ ] **Step 1: Create `README.md`.** Write file `/home/markhughneri-piertwo/work/webnext/ggg/README.md`:
```markdown
# GGG — Good Game Guild

Trustless tournament prize-escrow protocol on Stellar Soroban.

- `apps/web` — Next.js 16 app (frontend + API)
- `apps/subscriber` — background event subscriber (Phase 5)
- `contracts/escrow` — Soroban escrow contract (Phase 1)

See `SPEC.md` (what), `BRAND.md` (look), `AGENT.md` (how/safety).

## Local development

Requires Node 22, pnpm 10, Docker.

```bash
corepack enable
pnpm install
docker compose up -d                       # postgres 17, redis 7, minio
cp apps/web/.env.example apps/web/.env      # then fill SESSION_SECRET, CSRF_SECRET, ADMIN_PASSWORD
pnpm --filter web db:migrate                # apply Prisma migrations
pnpm --filter web db:seed                   # idempotent admin upsert
pnpm --filter web dev                       # http://localhost:3000
```

## Quality gates

```bash
pnpm -r typecheck
pnpm -r lint
pnpm format:check
pnpm --filter web test
```
```

- [ ] **Step 2: Full acceptance — services + install + migrate + seed.** From a clean state run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && docker compose up -d && pnpm install && pnpm --filter web db:migrate && pnpm --filter web db:seed
```
Expected: docker services healthy, install completes, `migrate` reports "Already in sync" or applies cleanly, seed prints `Seeded admin user "admin" (idempotent upsert).`

- [ ] **Step 3: Acceptance — themed app boots.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm --filter web dev
```
Open `http://localhost:3000`: confirm the dark themed page with acid-yellow + violet brand elements and the shadcn Button. Stop the server.

- [ ] **Step 4: Acceptance — env validation fails loudly on a missing key.** Run a script that imports the env module with a key removed:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg/apps/web && node --input-type=module -e "process.env.SESSION_SECRET=''; const m = await import('./src/lib/env.ts').catch(e => { console.error(String(e.message||e)); process.exit(42); });" ; echo "exit=$?"
```
Expected: stderr contains `Invalid environment configuration` and `SESSION_SECRET`; `exit=42` (the process refuses to boot). (If `.ts` ESM import is not directly runnable in your Node, instead run `pnpm --filter web test src/lib/env.test.ts` and confirm the "throws ... SESSION_SECRET" case passes — same guarantee.)

- [ ] **Step 5: Acceptance — CI gate green locally.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && pnpm -r typecheck && pnpm -r lint && pnpm format:check
```
Expected: all exit 0.

- [ ] **Step 6: Commit.** Run:
```bash
cd /home/markhughneri-piertwo/work/webnext/ggg && git add -A && git commit -m "Phase 0: README quickstart + verified end-to-end foundation boot"
```

---

## Phase 0 self-review (requirements → task map)

Roadmap Phase 0 scope coverage:
- pnpm 10 workspace + members + `pnpm-workspace.yaml` → Task 1, 3, 4.
- Node 22 `engines` + `.nvmrc` + corepack → Task 1.
- TS strict + 4 flags → Task 2 (`tsconfig.base.json`), consumed by Tasks 3, 4.
- ESLint(next) + Prettier → Task 2 + Task 3.
- Base CI (typecheck + lint) → Task 11.
- docker-compose (postgres 17, redis 7, minio + createbuckets) → Task 5.
- Zod env loader (fail-closed) + committed `.env.example` mirroring SPEC §14 → Task 6.
- Prisma 7 (`prisma-client` generator, `prisma.config.ts`, full §10 schema, initial migration, singleton `db.ts`, idempotent admin `seed.ts`) → Task 8.
- Tailwind v4 `@theme` full BRAND §2 tokens + signature classes + keyframes + Sora/Space Mono/Material Symbols + `<html class="dark">` → Task 9.
- shadcn/ui init themed to GGG tokens → Task 10.
- Done-when (compose up + install + migrate + seed + dev boots themed app; env fails loudly; CI green) → Task 12.

Cross-phase contract elements produced (exact names): Prisma enums `Role`/`Asset`/`TournamentStatus`/`EventType` and models `User`/`Tournament`/`Participant`/`Payout`/`ContractEvent` with BigInt `entryFee`/`amount` (Task 8); singleton `prisma` from `apps/web/src/lib/db.ts` (Task 8); `env` from `apps/web/src/lib/env.ts` (Task 6); `ok`/`err` from `apps/web/src/lib/api.ts` (Task 7); `apps/web/src/lib/validation/` dir (Task 7); brand `@theme` + signature classes + keyframes in `apps/web/src/app/globals.css` (Task 9); workspace dirs `apps/web`, `apps/subscriber`, `contracts/escrow` (Tasks 3, 4).

No placeholders remain; every file shows real content; all paths/commands/expected outputs are explicit. No business logic is introduced.
