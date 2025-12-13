# Field Merging Algorithm - Visual Flow

## Complete Lifecycle Example

This document visualizes the complete lifecycle of field merging across multiple component mounts/unmounts.

## Scenario: User Profile Page

### Initial State
```
┌──────────────────────────────────────┐
│ SelectionRegistry                     │
│                                       │
│ Endpoints: {}                         │
│                                       │
│ No subscriptions                      │
└──────────────────────────────────────┘
```

---

### Step 1: Component A Mounts (Profile Header)

**Component A needs**: `{ name: true, avatar: true }`

```typescript
registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "profile-header",
  selection: { name: true, avatar: true },
  onData: (data) => setHeaderData(data),
});
```

**Registry State:**
```
┌──────────────────────────────────────────────────┐
│ SelectionRegistry                                 │
│                                                   │
│ Endpoint: "user:123"                              │
│ ┌──────────────────────────────────────────────┐ │
│ │ Subscribers (1):                             │ │
│ │   • profile-header                           │ │
│ │     Selection: { name: true, avatar: true }  │ │
│ │                                              │ │
│ │ Merged Selection:                            │ │
│ │   { name: true, avatar: true }               │ │
│ │                                              │ │
│ │ isSubscribed: false                          │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘

Analysis:
  hasChanged: true
  isExpanded: true
  addedFields: Set(["name", "avatar"])
```

**Action**: `shouldResubscribe()` returns `"subscribe"`

**Network Request:**
```
→ SUBSCRIBE user:123 with { name: true, avatar: true }
```

**Server Response:**
```json
{
  "id": "123",
  "name": "Alice",
  "avatar": "https://example.com/alice.jpg"
}
```

**Data Distribution:**
```
distributeData("user:123", serverData)

Component: profile-header
  Receives: {
    id: "123",
    name: "Alice",
    avatar: "https://example.com/alice.jpg"
  }
```

---

### Step 2: Component B Mounts (Contact Info)

**Component B needs**: `{ email: true, phone: true }`

```typescript
registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "contact-info",
  selection: { email: true, phone: true },
  onData: (data) => setContactData(data),
});
```

**Registry State:**
```
┌──────────────────────────────────────────────────────────┐
│ SelectionRegistry                                         │
│                                                           │
│ Endpoint: "user:123"                                      │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Subscribers (2):                                     │ │
│ │   • profile-header                                   │ │
│ │     Selection: { name: true, avatar: true }          │ │
│ │   • contact-info                                     │ │
│ │     Selection: { email: true, phone: true }          │ │
│ │                                                      │ │
│ │ Merged Selection (EXPANDED):                         │ │
│ │   { name: true, avatar: true,                        │ │
│ │     email: true, phone: true }                       │ │
│ │                                                      │ │
│ │ isSubscribed: true                                   │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘

Analysis:
  hasChanged: true
  isExpanded: true
  addedFields: Set(["email", "phone"])
```

**Action**: `shouldResubscribe()` returns `"resubscribe"`

**Network Request:**
```
→ RE-SUBSCRIBE user:123 with {
    name: true,
    avatar: true,
    email: true,
    phone: true
  }
```

**Server Response:**
```json
{
  "id": "123",
  "name": "Alice",
  "avatar": "https://example.com/alice.jpg",
  "email": "alice@example.com",
  "phone": "555-1234"
}
```

**Data Distribution:**
```
distributeData("user:123", serverData)

Component: profile-header
  Filtered to: { name: true, avatar: true }
  Receives: {
    id: "123",
    name: "Alice",
    avatar: "https://example.com/alice.jpg"
  }

Component: contact-info
  Filtered to: { email: true, phone: true }
  Receives: {
    id: "123",
    email: "alice@example.com",
    phone: "555-1234"
  }
```

---

### Step 3: Component C Mounts (Posts List)

**Component C needs**: `{ posts: { title: true, createdAt: true } }`

```typescript
registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "posts-list",
  selection: { posts: { title: true, createdAt: true } },
  onData: (data) => setPostsData(data),
});
```

**Registry State:**
```
┌──────────────────────────────────────────────────────────────┐
│ SelectionRegistry                                             │
│                                                               │
│ Endpoint: "user:123"                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Subscribers (3):                                         │ │
│ │   • profile-header                                       │ │
│ │     { name: true, avatar: true }                         │ │
│ │   • contact-info                                         │ │
│ │     { email: true, phone: true }                         │ │
│ │   • posts-list                                           │ │
│ │     { posts: { title: true, createdAt: true } }          │ │
│ │                                                          │ │
│ │ Merged Selection (EXPANDED):                             │ │
│ │   { name: true, avatar: true,                            │ │
│ │     email: true, phone: true,                            │ │
│ │     posts: { title: true, createdAt: true } }            │ │
│ │                                                          │ │
│ │ isSubscribed: true                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Analysis:
  hasChanged: true
  isExpanded: true
  addedFields: Set(["posts", "posts.title", "posts.createdAt"])
```

**Action**: `shouldResubscribe()` returns `"resubscribe"`

**Network Request:**
```
→ RE-SUBSCRIBE user:123 with {
    name: true,
    avatar: true,
    email: true,
    phone: true,
    posts: { title: true, createdAt: true }
  }
```

**Server Response:**
```json
{
  "id": "123",
  "name": "Alice",
  "avatar": "https://example.com/alice.jpg",
  "email": "alice@example.com",
  "phone": "555-1234",
  "posts": [
    { "id": "1", "title": "Hello World", "createdAt": "2024-01-01" },
    { "id": "2", "title": "My Journey", "createdAt": "2024-01-15" }
  ]
}
```

**Data Distribution:**
```
distributeData("user:123", serverData)

Component: profile-header
  Filtered to: { name: true, avatar: true }
  Receives: {
    id: "123",
    name: "Alice",
    avatar: "https://..."
  }

Component: contact-info
  Filtered to: { email: true, phone: true }
  Receives: {
    id: "123",
    email: "alice@example.com",
    phone: "555-1234"
  }

Component: posts-list
  Filtered to: { posts: { title: true, createdAt: true } }
  Receives: {
    id: "123",
    posts: [
      { id: "1", title: "Hello World", createdAt: "2024-01-01" },
      { id: "2", title: "My Journey", createdAt: "2024-01-15" }
    ]
  }
```

---

### Step 4: Component B Unmounts (Contact Info Closed)

```typescript
registry.removeSubscriber("user:123", "contact-info");
```

**Registry State:**
```
┌──────────────────────────────────────────────────────────────┐
│ SelectionRegistry                                             │
│                                                               │
│ Endpoint: "user:123"                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Subscribers (2):                                         │ │
│ │   • profile-header                                       │ │
│ │     { name: true, avatar: true }                         │ │
│ │   • posts-list                                           │ │
│ │     { posts: { title: true, createdAt: true } }          │ │
│ │                                                          │ │
│ │ Merged Selection (SHRUNK):                               │ │
│ │   { name: true, avatar: true,                            │ │
│ │     posts: { title: true, createdAt: true } }            │ │
│ │                                                          │ │
│ │ isSubscribed: true                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Analysis:
  hasChanged: true
  isShrunk: true
  removedFields: Set(["email", "phone"])
```

**Action**: `shouldResubscribe()` returns `"none"` (only 2 fields removed, below threshold)

**Network Request:**
```
→ NO RE-SUBSCRIPTION (keep fetching email/phone to reduce churn)
```

**Rationale**: Only 2 fields removed. Re-subscribing for minor shrink causes unnecessary network overhead. Continue receiving email/phone even though no component needs them.

---

### Step 5: Component D Mounts (Post Details - Expanded Posts)

**Component D needs**: `{ posts: { title: true, body: true, comments: { count: true } } }`

```typescript
registry.addSubscriber({
  endpointKey: "user:123",
  subscriberId: "post-details",
  selection: {
    posts: {
      title: true,
      body: true,
      comments: { count: true }
    }
  },
  onData: (data) => setDetailedPosts(data),
});
```

**Registry State:**
```
┌──────────────────────────────────────────────────────────────┐
│ SelectionRegistry                                             │
│                                                               │
│ Endpoint: "user:123"                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Subscribers (3):                                         │ │
│ │   • profile-header                                       │ │
│ │     { name: true, avatar: true }                         │ │
│ │   • posts-list                                           │ │
│ │     { posts: { title: true, createdAt: true } }          │ │
│ │   • post-details                                         │ │
│ │     { posts: { title: true, body: true,                  │ │
│ │               comments: { count: true } } }               │ │
│ │                                                          │ │
│ │ Merged Selection (EXPANDED):                             │ │
│ │   { name: true, avatar: true,                            │ │
│ │     email: true, phone: true,    ← still fetched!        │ │
│ │     posts: {                                             │ │
│ │       title: true,                                       │ │
│ │       createdAt: true,                                   │ │
│ │       body: true,                ← NEW                   │ │
│ │       comments: { count: true }  ← NEW                   │ │
│ │     }                                                    │ │
│ │   }                                                      │ │
│ │                                                          │ │
│ │ isSubscribed: true                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Analysis:
  hasChanged: true
  isExpanded: true
  addedFields: Set(["posts.body", "posts.comments", "posts.comments.count"])
```

**Action**: `shouldResubscribe()` returns `"resubscribe"`

**Network Request:**
```
→ RE-SUBSCRIBE user:123 with {
    name: true,
    avatar: true,
    email: true,
    phone: true,
    posts: {
      title: true,
      createdAt: true,
      body: true,
      comments: { count: true }
    }
  }
```

---

### Step 6: All Post Components Unmount

```typescript
registry.removeSubscriber("user:123", "posts-list");
registry.removeSubscriber("user:123", "post-details");
```

**Registry State:**
```
┌──────────────────────────────────────────────────────────────┐
│ SelectionRegistry                                             │
│                                                               │
│ Endpoint: "user:123"                                          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Subscribers (1):                                         │ │
│ │   • profile-header                                       │ │
│ │     { name: true, avatar: true }                         │ │
│ │                                                          │ │
│ │ Merged Selection (SIGNIFICANTLY SHRUNK):                 │ │
│ │   { name: true, avatar: true,                            │ │
│ │     email: true, phone: true }                           │ │
│ │     ↑ still fetched (from step 4)                        │ │
│ │                                                          │ │
│ │ isSubscribed: true                                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

Analysis:
  hasChanged: true
  isShrunk: true
  removedFields: Set([
    "posts",
    "posts.title",
    "posts.createdAt",
    "posts.body",
    "posts.comments",
    "posts.comments.count"
  ])
  removedFields.size: 6 (> 3 threshold)
```

**Action**: `shouldResubscribe()` returns `"resubscribe"` (6 fields removed, above threshold)

**Network Request:**
```
→ RE-SUBSCRIBE user:123 with {
    name: true,
    avatar: true,
    email: true,
    phone: true
  }
```

**Rationale**: Removed 6 fields (posts with nested structure). This is significant enough to warrant re-subscription to reduce bandwidth.

---

### Step 7: Component A Unmounts (Last Subscriber)

```typescript
registry.removeSubscriber("user:123", "profile-header");
```

**Registry State:**
```
┌──────────────────────────────────────┐
│ SelectionRegistry                     │
│                                       │
│ Endpoints: {}                         │
│                                       │
│ No subscriptions                      │
└──────────────────────────────────────┘

Analysis:
  hasChanged: true
  isShrunk: true
  removedFields: Set([
    "name",
    "avatar",
    "email",
    "phone"
  ])
```

**Action**: `shouldResubscribe()` returns `"unsubscribe"`

**Network Request:**
```
→ UNSUBSCRIBE user:123
```

---

## Algorithm Decision Flow

```
┌─────────────────────────────────────┐
│ Component Mounts/Unmounts            │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ registry.addSubscriber() OR          │
│ registry.removeSubscriber()          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Recompute Merged Selection           │
│ (mergeSelections() for all subs)     │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Analyze Change                       │
│ - What fields added?                 │
│ - What fields removed?               │
│ - Is expansion/shrink significant?   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ shouldResubscribe()                  │
│                                      │
│ Decision Tree:                       │
│  • No subscribers? → unsubscribe     │
│  • First subscriber? → subscribe     │
│  • Expanded? → resubscribe           │
│  • Shrunk >3 fields? → resubscribe   │
│  • Otherwise → none (keep existing)  │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Network Action                       │
│  • subscribe: Create new             │
│  • resubscribe: Update existing      │
│  • unsubscribe: Remove               │
│  • none: No change                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ Server Sends Data                    │
│ (matches merged selection)           │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│ registry.distributeData()            │
│                                      │
│ For each subscriber:                 │
│   filteredData =                     │
│     filterToSelection(               │
│       fullData,                      │
│       subscriber.selection           │
│     )                                │
│   subscriber.onData(filteredData)    │
└─────────────────────────────────────┘
```

## Key Optimizations

### 1. Lazy Re-subscription on Shrink

```
Shrunk 1-3 fields    → Don't re-subscribe (avoid churn)
Shrunk >3 fields     → Re-subscribe (save bandwidth)
```

### 2. Immediate Re-subscription on Expand

```
Any new field added  → Re-subscribe immediately
                       (need data for new component)
```

### 3. Single Network Request per Endpoint

```
10 components wanting same endpoint
  → 1 merged subscription
  → 1 network request
  → 10 filtered distributions
```

### 4. Field Path Indexing

```
Instead of deep object comparison:
  previousFields = Set(["user.name", "user.email"])
  newFields = Set(["user.name", "user.posts.title"])

  added = newFields - previousFields
  removed = previousFields - newFields

  → O(n) set operations instead of O(n²) recursive compare
```

## Performance Example

**Scenario**: 100 components on a page, 10 unique endpoints

**Without Field Merging:**
- 100 subscriptions
- 100 network requests
- 100 data streams to manage
- 100× server load

**With Field Merging:**
- 100 tracked subscribers
- 10 merged subscriptions
- 10 network requests (90% reduction)
- 100 filtered distributions (client-side, fast)
- 10× server load (90% reduction)

**Memory Overhead:**
- Registry: ~10 endpoints × ~10 subscribers = ~100 entries
- Merged selections: ~10 × average selection size
- Cached data: ~10 × average data size
- Total: Minimal compared to savings

## Edge Case Handling

### Rapid Mount/Unmount

```
Component A mounts    → Subscribe
Component A unmounts  → Unsubscribe
Component B mounts    → Subscribe again
Component B unmounts  → Unsubscribe again
```

**Optimization**: Add debouncing layer
```typescript
let resubscribeTimer = null;

function debouncedResubscribe(analysis) {
  clearTimeout(resubscribeTimer);
  resubscribeTimer = setTimeout(() => {
    if (shouldResubscribe(analysis, ...) !== "none") {
      actualResubscribe();
    }
  }, 100); // 100ms debounce
}
```

### Overlapping Selections

```
Component A: { user: { name: true } }
Component B: { user: { name: true, email: true } }
Component C: { user: { name: true } }

Merged: { user: { name: true, email: true } }

Component B unmounts:
  → Still need { name: true, email: true }? NO
  → Shrink to { name: true }
  → Only 1 field removed → Don't re-subscribe
```

### Null Data

```
Server sends: { user: null }

Component A (wants name):
  filterToSelection(null, { name: true })
  → null (passes through)

Component receives: null
```
