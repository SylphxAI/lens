# Field Selection

Like GraphQL, Lens supports selecting specific fields to fetch. This reduces data transfer and improves performance.

## Basic Selection

Select only the fields you need:

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    email: true,
  }
})

// Result: { name: 'Alice', email: 'alice@example.com' }
// Other fields are NOT fetched
```

## Type Inference

Selected types are inferred:

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    email: true,
  }
})

// TypeScript knows exact shape:
// user: { name: string; email: string }

user.name   // ✅ Valid
user.posts  // ❌ TypeScript error - not selected
```

## Nested Selection

Select fields on related objects:

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      select: {
        title: true,
        createdAt: true,
      }
    }
  }
})

// Result:
// {
//   name: 'Alice',
//   posts: [
//     { title: 'First Post', createdAt: '2024-01-01' },
//     { title: 'Second Post', createdAt: '2024-01-02' },
//   ]
// }
```

## Deep Nesting

Selection can be arbitrarily deep:

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      select: {
        title: true,
        comments: {
          select: {
            content: true,
            author: {
              select: {
                name: true,
              }
            }
          }
        }
      }
    }
  }
})
```

## Field Arguments

Pass arguments to specific fields (like GraphQL):

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      args: {
        first: 5,
        published: true,
        orderBy: 'createdAt',
      },
      select: {
        title: true,
        createdAt: true,
      }
    }
  }
})
```

### Common Field Arguments

```typescript
// Pagination
posts: {
  args: { first: 10, after: 'cursor' },
  select: { ... }
}

// Filtering
posts: {
  args: { published: true, category: 'tech' },
  select: { ... }
}

// Sorting
posts: {
  args: { orderBy: 'createdAt', order: 'desc' },
  select: { ... }
}
```

## Scalar Field Arguments

Even scalar fields can have arguments:

```typescript
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    postsCount: {
      args: { published: true },
    },
  }
})

// Result: { name: 'Alice', postsCount: 42 }
```

## Without Selection

If you don't specify selection, you get all exposed fields:

```typescript
// No selection - returns all fields
const user = await client.user.get({ id: '123' })

// With selection - returns only selected fields
const user = await client.user.get({ id: '123' }, {
  select: { name: true }
})
```

## With Subscriptions

Selection works with live queries:

```typescript
client.user.get({ id: '123' }, {
  select: {
    name: true,
    status: true,  // Live field
  }
}).subscribe((user) => {
  // Only selected fields update
  console.log(user.name, user.status)
})
```

## Comparison with GraphQL

```graphql
# GraphQL
query {
  user(id: "123") {
    name
    posts(first: 5, published: true) {
      title
      author {
        name
      }
    }
  }
}
```

```typescript
// Lens equivalent
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    posts: {
      args: { first: 5, published: true },
      select: {
        title: true,
        author: {
          select: { name: true }
        }
      }
    }
  }
})
```

**Key difference**: Lens doesn't require code generation - types are inferred directly from TypeScript.

## Automatic Selection Merging

When multiple components subscribe to the same endpoint with different field selections, Lens automatically merges them for optimal efficiency.

### How It Works

```typescript
// Component A - wants name only
const UserName = () => {
  const { data } = client.user.get.useQuery({
    input: { id: '123' },
    select: { name: true }
  })
  return <h1>{data?.name}</h1>
}

// Component B - wants email and status
const UserStatus = () => {
  const { data } = client.user.get.useQuery({
    input: { id: '123' },
    select: { email: true, status: true }
  })
  return <span>{data?.email} - {data?.status}</span>
}
```

**What happens internally:**

1. Component A subscribes with `{ name: true }`
2. Component B subscribes with `{ email: true, status: true }`
3. Lens merges to `{ name: true, email: true, status: true }`
4. **ONE** network request/subscription is made with the merged selection
5. Each component receives only their requested fields:
   - Component A gets `{ id, name }`
   - Component B gets `{ id, email, status }`

### Dynamic Expansion

When a new component needs additional fields, Lens automatically re-subscribes:

```typescript
// Initially: Component A subscribes → request { name }
// Then: Component B subscribes → re-subscribe with { name, email, status }
// Both components receive updated data
```

### Data Filtering

Each component receives only what it requested - no data leakage:

```typescript
// Server returns full data:
// { id: '123', name: 'Alice', email: 'alice@example.com', status: 'online' }

// Component A sees: { id: '123', name: 'Alice' }
// Component B sees: { id: '123', email: 'alice@example.com', status: 'online' }
```

### Query Batching

Queries in the same microtask are automatically batched:

```typescript
// These three queries execute as ONE request
const [user, posts, comments] = await Promise.all([
  client.user.get({ input: { id: '123' }, select: { name: true } }),
  client.user.get({ input: { id: '123' }, select: { email: true } }),
  client.user.get({ input: { id: '123' }, select: { status: true } }),
])

// Internal: ONE request with { name, email, status }
// Each promise resolves with its filtered data
```

### Benefits

| Without Merging | With Merging |
|----------------|--------------|
| 100 components = 100 requests | 100 components = 10 requests (unique endpoints) |
| Duplicate data streams | Single optimized stream per endpoint |
| High bandwidth usage | Minimal bandwidth |
| Server overload risk | Efficient server utilization |

### Cleanup

When components unmount, they're automatically cleaned up:

```typescript
// Component A unmounts → removed from subscriber list
// Component B still active → subscription continues
// All components unmount → subscription closed
```

## Performance Benefits

Selection optimizes both network and database:

```typescript
// ❌ Over-fetching: Fetches everything
const user = await client.user.get({ id: '123' })
// Returns all user fields + all posts + all comments...

// ✅ Efficient: Fetches only what's needed
const user = await client.user.get({ id: '123' }, {
  select: {
    name: true,
    email: true,
  }
})
// Server only resolves name and email
```

## Best Practices

### 1. Always Use Selection in Production

```typescript
// ✅ Good: Select what you need
const user = await client.user.get({ id }, {
  select: { name: true, avatar: true }
})

// ❌ Bad: Fetch everything
const user = await client.user.get({ id })
```

### 2. Colocate Selection with UI

```typescript
// components/UserCard.tsx
const UserCardSelection = {
  name: true,
  avatar: true,
  bio: true,
} as const

function UserCard({ userId }: { userId: string }) {
  const { data } = client.user.get.useQuery({
    input: { id: userId },
    select: UserCardSelection,
  })
  // ...
}
```

### 3. Use Field Arguments for Filtering

```typescript
// ✅ Good: Filter on server
const user = await client.user.get({ id }, {
  select: {
    posts: {
      args: { published: true, first: 10 },
      select: { title: true }
    }
  }
})

// ❌ Bad: Fetch all, filter on client
const user = await client.user.get({ id })
const publishedPosts = user.posts.filter(p => p.published).slice(0, 10)
```

### 4. Type Your Selections

```typescript
import type { SelectionObject } from '@sylphx/lens-client'

const userSelection = {
  name: true,
  email: true,
  posts: {
    args: { first: 5 },
    select: { title: true }
  }
} satisfies SelectionObject

const user = await client.user.get({ id }, { select: userSelection })
```
