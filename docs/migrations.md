# Migration Conventions

Prisma 7 migrations live in `apps/web/prisma/migrations`. Never edit an applied migration — add a new one. Money columns are `BigInt` (token smallest unit). Timestamps default to `now()`; `updatedAt` uses `@updatedAt`.
