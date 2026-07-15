# lens — local agent notes only

Doctrine and fleet delivery law live in the **host always-on constitution**
(`~/.grok/AGENTS.md` / Doctrine template). This file must **not** restate,
weaken, or fork that law (including PR-vs-direct-trunk delivery).

Local truth: [`PROJECT.md`](./PROJECT.md), [`.doctrine/project.json`](./.doctrine/project.json)
when present.

## Boundary hazards

- TypeScript is the schema/source of truth; do not require SDL/codegen as public
  contract without a new ADR.
- Keep `model()` / resolver / subscription semantics consistent across packages.
- Preserve explicit resolver exposure and secure-by-default field behavior.
- Server core stays a pure executor; protocol/framework stay in adapters.
- Separate transport, storage, framework bindings, and examples by package.
- Do not silently resurrect deprecated `entity()` or legacy subscription patterns.
- Never commit secrets, tokens, or customer data.

## Local commands

```bash
bun run typecheck
bun run test
bun run lint
bun run build
```

## Validation notes

- Docs-only: diff review + referenced paths exist.
- Runtime/API: targeted package tests + affected example/integration when practical.
- Report layers honestly: local diff · trunk FF · publish (if in scope).
