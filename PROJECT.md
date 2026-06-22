# Lens Project

Lens is a TypeScript-first, real-time API framework where every query can be
used as a live subscription. It owns the server executor, client transports,
framework bindings, storage adapters, docs, and npm package release path for the
Lens package family.

## Lifecycle

- Lifecycle: `production`
- Layer: `foundation`
- Doctrine source of truth: [SylphxAI/doctrine](https://github.com/SylphxAI/doctrine)
- Machine manifest: `.doctrine/project.json`

## Goals

- Make real-time TypeScript APIs simple without GraphQL SDL or code generation.
- Keep server execution, transport adapters, storage adapters, framework
  bindings, examples, and docs aligned across the package family.
- Preserve automatic live queries, minimal diff updates, type-safe field
  selection, and multi-server routing as public product promises.

## Non-Goals

- Do not introduce GraphQL SDL/codegen as a required public source of truth.
- Do not put product-specific backend assumptions into core framework packages.
- Do not publish package changes without release workflow evidence and npm
  readback.

## Boundaries

Lens owns the TypeScript API framework and package family. Product applications
consume Lens only through its documented package exports and adapters. Storage,
transport, and framework integrations stay separated by package boundary.

## Public Surfaces

- Package exports under `packages/*/package.json`
- Public framework docs in `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, and
  package READMEs
- ADRs under `docs/adr/`
- GitHub Actions `CI` and reusable `Release` workflow

## Delivery

PRs run self-hosted `Build & Test` and `Lint` checks. Main pushes use the
central reusable release workflow to publish npm packages. Published versions
are forward-fix-only and require package registry readback.

