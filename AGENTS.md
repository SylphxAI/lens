# lens — local agent notes only

Static engineering and delivery standards load from the active Skills runtime
([SylphxAI/skills](https://github.com/SylphxAI/skills) is binding instruction
SSOT). Doctrine and Mission Control are retired historical lineage and must not
be loaded as current instruction authority.

Local truth: `PROJECT.md`, `.doctrine/project.json` when present.

## Boundary hazards

- TypeScript is the schema/source of truth; do not require SDL/codegen as public
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

- Prefer the **narrowest** affected check before full workspace runs.
- Report layers honestly: local diff · trunk FF · deploy · prod proof (do not collapse).
