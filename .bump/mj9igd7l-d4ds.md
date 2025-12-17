---
release: patch
---

refactor: remove deprecated APIs and clean up resolver system

- Remove deprecated entity() API and t.* type builders
- Remove model().resolve() and model().subscribe() chain patterns
- Simplify resolver system: Model = pure schema, Resolver = separate implementation
- Update createResolverFromEntity() to create exposed-only resolvers
- Deprecate hasInlineResolvers() (always returns false)
- Auto-generate exposed-only resolvers for models without explicit resolvers
