# Lens Agent Instructions

## Scope

This file is the repo-local operating policy for agents working in
`SylphxAI/lens`. Org-wide engineering doctrine is owned by `SylphxAI/doctrine`;
this file only specializes that SSOT for the Lens API-framework boundary.

Lens is a TypeScript-first, real-time API framework where type-safe operations,
models, resolvers, transports, client bindings, storage adapters, and examples
must stay aligned. The product promise is "every query can be live" without
forcing product-specific or hosted-service assumptions into the core packages.

## Read First

Before proposing or implementing changes, read the smallest relevant set of
these source-of-truth documents:

1. `README.md` — public API shape, mental model, resolver patterns, and package
   overview.
2. `PRODUCT.md` — product vision, target users, differentiators, success metrics,
   and feature status.
3. `ARCHITECTURE.md` — SSOT architecture, pure executor model, adapter pattern,
   storage, transport, and package boundaries.
4. Relevant ADRs under `docs/adr/`, especially:
   - `docs/adr/001-unified-entity-definition.md`
   - `docs/adr/002-two-phase-field-resolution.md`
   - `docs/adr/003-resolver-subscription-design.md`
5. `docs/implementation-plan.md` before model/entity/resolver API work.
6. The touched package README under `packages/*/README.md` and any affected
   examples before changing public API, client bindings, storage adapters, or
   docs.

## Non-Negotiables

- Preserve TypeScript as the schema/source of truth. Do not add SDL/codegen as a
  required public contract without a new ADR.
- Keep `model()` / resolver / subscription semantics consistent across core,
  server, clients, examples, and docs.
- Preserve explicit resolver exposure and secure-by-default field behavior.
- Keep the server core a pure executor; protocol and framework concerns belong
  in adapters/packages.
- Keep transport, storage, framework bindings, and examples separated by package
  boundary.
- Do not silently resurrect deprecated `entity()` or legacy subscription patterns
  in new docs/examples.
- Do not commit secrets, tokens, customer data, generated credentials, or
  product-specific service assumptions.
- Use branch → commit → PR. Do not push directly to `main`, force-push, merge,
  publish, or release without manager-visible evidence and required gates.

## Workflow

1. Identify the owning boundary: core schema/model, resolver execution,
   subscription/live-query semantics, transport adapter, storage adapter,
   framework binding, docs/examples, release, or package build.
2. Check open PRs/issues for the same public API or shared docs before editing.
3. Prefer the smallest evidence-backed slice; public API changes require tests,
   examples, docs, and migration notes together.
4. For accepted ADR/spec work, record implementation status, blocker, or PR scope
   with file-path evidence.
5. Keep generated or package output changes out of docs-only PRs unless release
   workflow explicitly owns them.

## Validation

Use the narrowest meaningful validation first, then broaden as needed:

- `bun run typecheck`
- `bun run test`
- `bun run lint`
- `bun run build`

Docs-only boundary changes may be validated by reviewing the diff and checking
referenced files exist. Runtime/API changes need targeted package tests and at
least one affected example or integration test where practical.

## Reporting

When reporting completed work, include changed files, boundaries read, validation
run, PR/issue links, and residual risk. Be explicit when no runtime behavior,
public API, package build, generated output, release, or customer/product data
changed.
