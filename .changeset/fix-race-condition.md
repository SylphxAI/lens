---
"@sylphx/lens-client": patch
---

Fixed race condition where multiple rapid `subscribe()` calls to the same endpoint could create duplicate server subscriptions. The issue occurred because the `isSubscribed` flag was set asynchronously after `ensureConnected()` completed, allowing concurrent calls to pass the guard check. Now `isSubscribed` is set immediately at the start of `startSubscription()` to prevent this race.
