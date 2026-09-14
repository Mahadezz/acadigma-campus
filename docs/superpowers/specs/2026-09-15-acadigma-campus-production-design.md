# Acadigma Campus Production Design

## Purpose

Acadigma Campus will become a secure, multi-tenant education platform for schools, independent teachers, parents, and academic-resource sellers. The existing Base44 export is a functional product reference only. The new implementation must not inherit its client-side-only authorization or publicly exposed sensitive-file model.

## Product surfaces

The product ships from one monorepo as four clients:

- Web: Next.js application and installable PWA for school administrators, teachers, parents, and marketplace users.
- Mobile: Expo application for iOS and Android, focused initially on attendance, schedules, messages, notifications, student progress, and approvals.
- Desktop: Tauri application for office workflows, report/print operations, and the local print-agent connection.
- API: a server-side service that owns authorization, business rules, integrations, jobs, and audit events.

The web app is the full-featured administration surface. Mobile and desktop share product rules and API contracts, but do not force one UI implementation across very different interaction patterns.

## Architecture

The repository is a TypeScript monorepo managed with pnpm workspaces and Turborepo.

```text
apps/
  api/          Fastify API, OpenAPI contract, job entry points
  web/          Next.js PWA
  mobile/       Expo / React Native
  desktop/      Tauri shell and local-print bridge
packages/
  contracts/    API schemas and generated client types
  domain/       roles, permissions, policies, calculations
  validation/   Zod request and form schemas
  design-tokens/ shared color, type, spacing, and motion tokens
  config/       TypeScript, ESLint, test, and build configuration
infra/
  docker/       local dependencies and development bootstrap
  migrations/   PostgreSQL schema and row-level-security policies
```

The API uses PostgreSQL for transactional data, Redis-backed queues for scheduled and asynchronous work, S3-compatible private object storage for files, and a transactional email provider. All integrations—payments, AI, email, push notifications, and printing—are accessed from server-side adapters. Clients never receive provider secrets or broad database credentials.

## Tenancy, identity, and authorization

Every record belongs to an organization (school, personal workspace, or seller workspace) unless it is explicitly global. An organization can have multiple workspaces and members. Membership is the sole source of in-organization access; roles are owner, administrator, teacher, staff, parent, and seller.

Authorization is enforced three times:

1. PostgreSQL row-level security constrains every tenant-scoped read and write.
2. API policy checks validate membership, role, action, and record relationship before business operations.
3. Client route and feature guards improve user experience but are never trusted for security.

Object storage uses private buckets. Downloads are authorized by the API and issued as short-lived, scoped URLs. Identity documents, CVs, certificates, student records, and paid marketplace files cannot be reached by public URLs.

## Domain modules and release order

### Release 0 — Production foundation

Monorepo tooling, CI, environment validation, authentication, organization and membership model, RLS, audit trail, design tokens, observability, private storage, error handling, and testing infrastructure.

### Release 1 — Campus core

School onboarding, role-aware navigation, classes, students, admissions, guardians, attendance, marks, schedules, assignments, exams, handouts, messaging, notifications, reporting, and parent read-only access.

### Release 2 — Teaching intelligence

Curriculum, lesson plans, lesson logs, templates, AI-assisted planning with quota enforcement, resource library, behavior tracking, workload views, and school analytics.

### Release 3 — Commerce and operations

Marketplace listings, seller verification, protected purchases and downloads, Stripe Connect payouts, subscriptions, invoices, credit allocation, recruitment, cover-teacher workflows, and print queues.

### Release 4 — Automation and platform expansion

Local desktop print agent, attendance-informed print quantities, QR/barcode workflows, scheduled credit renewal and notifications, real-time updates, offline-capable mobile attendance, and advanced analytics.

Each release is independently deployable. A later module cannot weaken the tenant or file-security guarantees established in Release 0.

## API and data rules

- All client/API contracts use versioned Zod schemas and generated TypeScript types.
- API resources are organization-scoped by default; global data is explicitly marked and reviewed.
- Cursor pagination, stable sorting, search limits, and rate limits are standard for list endpoints.
- Mutations are idempotent where retries are possible, especially attendance saves, payments, invitations, and background jobs.
- State-changing operations create immutable audit events containing actor, organization, action, target, correlation ID, and safe metadata.
- Import/export and reporting jobs run asynchronously; files expire from private staging areas.
- Payment webhooks are verified, persisted, and processed idempotently before any entitlement changes.

## Multi-platform behavior

The API and domain packages are shared across platforms. The mobile app prioritizes low-latency, task-focused workflows and stores a minimal encrypted offline queue for attendance only. The desktop application owns only local device capabilities such as printer discovery and print submission; it communicates with the API using the authenticated account and never writes directly to the database.

## Quality, security, and operations

Required checks before each deployment:

- Type checking, linting, unit tests, integration tests, and browser E2E tests.
- Tenant-isolation and role-escalation tests for every new scoped resource.
- Dependency, secret, and static-security scans.
- Migration validation against a disposable PostgreSQL database.
- Accessibility checks for keyboard navigation, semantic labels, contrast, and mobile touch targets.

Production telemetry includes structured logs, traces, error reporting, health checks, uptime monitoring, audit-log retention, database backups, restore drills, and integration failure alerts. PII is minimized in logs and error reports.

## Migration strategy

The Base44 export remains unchanged. Data migration is a separately versioned, dry-run-first process: map entities, validate ownership, import to staging, reconcile counts and samples, obtain sign-off, then run the production import. There is no automatic cutover until the campus-core acceptance tests pass.

## Definition of done

A release is production-ready only when the implemented workflows pass their acceptance tests on web, iOS, Android, and desktop where applicable; authorization is enforced server-side; migrations are reversible or have a documented forward recovery; monitoring is live; and the user-facing release notes and operational runbook are updated.
