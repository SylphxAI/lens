---
"@sylphx/lens-core": patch
"@sylphx/lens-client": patch
"@sylphx/lens-server": patch
---

## Bug Fixes

- Fix memory leak in WebSocket handshake timeout cleanup
- Fix TypeScript strict mode errors across packages
- Add cycle detection to `resolveEntityFields` preventing infinite recursion with circular entity references (e.g., User.posts → Post.author → User)

## Tests

- Unskip v2-complete tests after cycle detection fix (15 tests now passing)
- Add comprehensive tests for dataloader batching
- Fix biome lint issues (import sorting, unused variables)
