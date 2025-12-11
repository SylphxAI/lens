---
release: minor
---

Add plain object model API and scalar type builder

- New API: `model('User', { id: id(), name: string(), ... })`
- Add `scalar()` for custom scalar types
- Add standalone field builders: `id()`, `string()`, `int()`, etc.
- Add `list()` and `nullable()` wrappers for field definitions
- Rename `CustomType` → `ScalarType`
