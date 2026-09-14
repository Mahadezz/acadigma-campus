# Production Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Establish a runnable, tested monorepo ready to host Acadigma Campus web, mobile, desktop, and API clients without trusting client-side authorization.

**Architecture:** pnpm workspaces contain shared contracts and domain policies, a Fastify API, and a Next.js web client. Docker-dependent services are documented but are not required to run the initial web/API loop.

**Tech Stack:** Node.js 24, pnpm 11, TypeScript, Turborepo, Next.js, Fastify, Zod, Vitest, ESLint, Prettier, Docker Compose.

**Spec:** \`docs/superpowers/specs/2026-09-15-acadigma-campus-production-design.md\`

## Global Constraints

- The Base44 export stays outside this repository and remains unmodified.
- API authorization is the security boundary; client navigation checks are never authorization.
- Tenant-scoped data requires organization and workspace context before every read or write.
- Private files are served only through API-authorized, time-limited access links.
- All external integrations are accessed by server-side adapters; no secret is shipped to a client.
- Validate every public API input with Zod and use stable structured error payloads.
- New functionality includes unit tests; client-to-API behavior includes integration tests.
- Node.js 24 and pnpm 11 are the supported local toolchain for this release.

---

## File map

~~~
package.json                         workspace scripts and toolchain pin
pnpm-workspace.yaml                  workspace boundaries
turbo.json                           task dependency graph
tsconfig.base.json                   strict shared TypeScript defaults
apps/api/                            Fastify API, health endpoint, tests
apps/web/                            Next.js PWA-ready shell and API status UI
apps/mobile/                         Expo placeholder and shared-contract boundary
apps/desktop/                        Tauri placeholder and print-bridge boundary
packages/contracts/                  versioned API schemas and error envelope
packages/domain/                     roles and server-side policy functions
infra/docker-compose.yml             local PostgreSQL, Redis, and MinIO services
.github/workflows/ci.yml             installation, typecheck, lint, test, build
~~~

### Task 1: Create the workspace toolchain

**Files:**
- Create: \`package.json\`
- Create: \`pnpm-workspace.yaml\`
- Create: \`turbo.json\`
- Create: \`tsconfig.base.json\`
- Create: \`.gitignore\`
- Create: \`.npmrc\`

**Interfaces:**
- Produces: \`pnpm dev\`, \`pnpm build\`, \`pnpm typecheck\`, \`pnpm lint\`, and \`pnpm test\`.
- Consumes: Node.js 24 and pnpm 11.

- [ ] **Step 1: Write the workspace manifest**

~~~json
{
  "name": "acadigma-campus",
  "private": true,
  "packageManager": "pnpm@11.19.0",
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "typecheck": "turbo typecheck",
    "lint": "turbo lint",
    "test": "turbo test"
  }
}
~~~

- [ ] **Step 2: Add workspace and strict compiler configuration**

~~~yaml
packages:
  - apps/*
  - packages/*
~~~

~~~json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true
  }
}
~~~

- [ ] **Step 3: Install dependencies and verify task discovery**

Run: \`pnpm install && pnpm --version\`

Expected: the lockfile is created and the version is \`11.19.0\`.

- [ ] **Step 4: Commit**

~~~bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore .npmrc pnpm-lock.yaml
git commit -m "chore: initialize production monorepo"
~~~

### Task 2: Define shared contracts and authorization policy

**Files:**
- Create: \`packages/contracts/package.json\`
- Create: \`packages/contracts/src/index.ts\`
- Create: \`packages/contracts/src/health.ts\`
- Create: \`packages/contracts/src/errors.ts\`
- Create: \`packages/domain/package.json\`
- Create: \`packages/domain/src/index.ts\`
- Create: \`packages/domain/src/roles.ts\`
- Create: \`packages/domain/src/policy.ts\`
- Test: \`packages/domain/src/policy.test.ts\`

**Interfaces:**
- Produces: \`HealthResponseSchema\`, \`ApiErrorSchema\`, \`Role\`, \`canPerform(role, action)\`, and \`assertOrganizationAccess(context, organizationId)\`.
- Consumes: Zod only; it must not import browser or server framework code.

- [ ] **Step 1: Write failing policy tests**

~~~ts
import { canPerform } from './policy';

it('prevents teachers from managing billing', () => {
  expect(canPerform('teacher', 'billing.manage')).toBe(false);
});

it('allows an owner to manage billing', () => {
  expect(canPerform('owner', 'billing.manage')).toBe(true);
});
~~~

- [ ] **Step 2: Run the test to verify failure**

Run: \`pnpm --filter @acadigma/domain test\`

Expected: FAIL because \`canPerform\` does not exist.

- [ ] **Step 3: Implement explicit role/action policy and contracts**

~~~ts
export type Role = 'owner' | 'administrator' | 'teacher' | 'staff' | 'parent' | 'seller';

export function canPerform(role: Role, action: string): boolean {
  return permissions[action]?.includes(role) ?? false;
}
~~~

- [ ] **Step 4: Re-run shared package tests and typecheck**

Run: \`pnpm --filter @acadigma/domain test && pnpm --filter @acadigma/contracts typecheck\`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add packages/contracts packages/domain
git commit -m "feat: add shared contracts and access policy"
~~~

### Task 3: Build the API health boundary

**Files:**
- Create: \`apps/api/package.json\`
- Create: \`apps/api/tsconfig.json\`
- Create: \`apps/api/src/app.ts\`
- Create: \`apps/api/src/server.ts\`
- Create: \`apps/api/src/routes/health.ts\`
- Test: \`apps/api/src/routes/health.test.ts\`

**Interfaces:**
- Consumes: \`HealthResponseSchema\` from \`@acadigma/contracts\`.
- Produces: \`buildApp()\` and \`GET /v1/health\` returning \`{ status: 'ok', service: 'api', timestamp }\`.

- [ ] **Step 1: Write a failing injected-request test**

~~~ts
const app = buildApp();
const response = await app.inject({ method: 'GET', url: '/v1/health' });
expect(response.statusCode).toBe(200);
expect(response.json().status).toBe('ok');
~~~

- [ ] **Step 2: Run the API test to verify failure**

Run: \`pnpm --filter @acadigma/api test\`

Expected: FAIL because \`buildApp\` and the route do not exist.

- [ ] **Step 3: Implement the Fastify app and route**

~~~ts
export function buildApp() {
  const app = Fastify({ logger: true });
  app.get('/v1/health', () => HealthResponseSchema.parse({
    status: 'ok', service: 'api', timestamp: new Date().toISOString(),
  }));
  return app;
}
~~~

- [ ] **Step 4: Verify API behavior and type safety**

Run: \`pnpm --filter @acadigma/api test && pnpm --filter @acadigma/api typecheck\`

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add apps/api
git commit -m "feat: add validated API health endpoint"
~~~

### Task 4: Build the web production shell

**Files:**
- Create: \`apps/web/package.json\`
- Create: \`apps/web/next.config.ts\`
- Create: \`apps/web/tsconfig.json\`
- Create: \`apps/web/app/layout.tsx\`
- Create: \`apps/web/app/page.tsx\`
- Create: \`apps/web/app/globals.css\`
- Create: \`apps/web/lib/api.ts\`
- Test: \`apps/web/lib/api.test.ts\`

**Interfaces:**
- Consumes: \`HealthResponseSchema\` from \`@acadigma/contracts\` and \`NEXT_PUBLIC_API_URL\`.
- Produces: a landing page that renders service health from \`/v1/health\` and fails safely when the API is unavailable.

- [ ] **Step 1: Write the failing API-client test**

~~~ts
await expect(fetchHealth('http://localhost:4100')).resolves.toMatchObject({
  status: 'ok', service: 'api',
});
~~~

- [ ] **Step 2: Run the test to verify failure**

Run: \`pnpm --filter @acadigma/web test\`

Expected: FAIL because \`fetchHealth\` does not exist.

- [ ] **Step 3: Implement schema-validated fetch and the accessible shell**

~~~ts
export async function fetchHealth(apiUrl: string) {
  const response = await fetch(\`\${apiUrl}/v1/health\`, { cache: 'no-store' });
  if (!response.ok) throw new Error('API health check failed');
  return HealthResponseSchema.parse(await response.json());
}
~~~

- [ ] **Step 4: Verify production build**

Run: \`pnpm --filter @acadigma/web test && pnpm --filter @acadigma/web build\`

Expected: PASS and Next.js emits a production build.

- [ ] **Step 5: Commit**

~~~bash
git add apps/web
git commit -m "feat: add web production shell"
~~~

### Task 5: Set client boundaries and local infrastructure contract

**Files:**
- Create: \`apps/mobile/README.md\`
- Create: \`apps/desktop/README.md\`
- Create: \`infra/docker-compose.yml\`
- Create: \`.env.example\`
- Create: \`README.md\`

**Interfaces:**
- Produces: declared mobile, desktop, Postgres, Redis, and MinIO boundaries without allowing any client direct database access.
- Consumes: API URL, database URL, Redis URL, S3 endpoint, and environment-variable names defined in \`.env.example\`.

- [ ] **Step 1: Write environment examples without secrets**

~~~dotenv
API_PORT=4100
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:4100
DATABASE_URL=postgresql://acadigma:acadigma@localhost:5432/acadigma
REDIS_URL=redis://localhost:6379
S3_ENDPOINT=http://localhost:9000
~~~

- [ ] **Step 2: Define local service health checks in Docker Compose**

~~~yaml
services:
  postgres:
    image: postgres:17-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U acadigma -d acadigma"]
~~~

- [ ] **Step 3: Document client constraints**

The mobile client uses the API only; the desktop client uses the API and exposes printer integration behind a local bridge. Neither client has database, object-storage, payment, or AI provider credentials.

- [ ] **Step 4: Verify repository instructions**

Run: \`pnpm typecheck && pnpm lint && pnpm test && pnpm build\`

Expected: PASS. Docker services are not required for this command.

- [ ] **Step 5: Commit**

~~~bash
git add apps/mobile apps/desktop infra .env.example README.md
git commit -m "docs: define client and local infrastructure boundaries"
~~~

### Task 6: Add continuous integration

**Files:**
- Create: \`.github/workflows/ci.yml\`

**Interfaces:**
- Consumes: root scripts from Task 1.
- Produces: pull-request and main-branch checks for install, typecheck, lint, test, and build.

- [ ] **Step 1: Write the workflow**

~~~yaml
name: Continuous Integration
on:
  pull_request:
  push:
    branches: [main]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.19.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
~~~

- [ ] **Step 2: Validate root scripts locally**

Run: \`pnpm typecheck && pnpm lint && pnpm test && pnpm build\`

Expected: PASS.

- [ ] **Step 3: Commit and push**

~~~bash
git add .github/workflows/ci.yml
git commit -m "ci: verify production foundation"
git push
~~~

## Plan self-review

- Spec coverage: Tasks 1-6 implement the release-0 code foundation, API boundary, web shell, shared policy/contracts, service-boundary documentation, tests, and CI.
- Deferred scope: database RLS, private storage, authentication, audit records, and observability require a separate executable foundation plan after provider and migration choices are locked; their non-negotiable constraints are in the design.
- Placeholder scan: no implementation placeholders or deferred code markers are present in the task instructions.
- Type consistency: \`HealthResponseSchema\` is created in contracts and consumed by API and web; \`Role\` and \`canPerform\` are created in domain and used only from server-safe code.
