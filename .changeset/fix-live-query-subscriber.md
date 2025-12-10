---
"@sylphx/lens-server": patch
---

fix: call _subscriber for operation-level LiveQueryDef

Previously, query().resolve().subscribe() defined _subscriber but the server never called it.
Only field-level .resolve().subscribe() worked. Now operation-level live queries work correctly.
