---
"@sylphx/lens-core": patch
"@sylphx/lens-client": patch
"@sylphx/lens-server": patch
"@sylphx/lens": patch
"@sylphx/lens-react": patch
"@sylphx/lens-vue": patch
"@sylphx/lens-svelte": patch
"@sylphx/lens-solid": patch
---

Republish all packages with verified build configuration

- All packages now use workspace bunup configuration
- Explicit return types for isolated declarations
- Framework packages properly externalize peer dependencies
- Solid package uses tsc for type generation
