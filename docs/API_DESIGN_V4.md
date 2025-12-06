# Lens API v4 Design

## Overview

This document outlines the unified tRPC-style API for Lens. The key principle: **one `createClient`, one call pattern, automatic hook/promise based on usage**.

## Core Principles

1. **Unified Client**: Single `createClient` from framework package gives you everything
2. **No Redundancy**: No `.useQuery()` / `.useMutation()` - endpoint type determines behavior
3. **Direct Calls**: `client.user.get({ input })` in component = hook
4. **Explicit Fetch**: `client.user.get.fetch({ input })` = promise for SSR
5. **Type Safety**: Full TypeScript inference from router to component

---

## Quick Start

### Setup (one-time)

```typescript
// lib/client.ts
import { createClient } from "@sylphx/lens-react";
import { httpTransport } from "@sylphx/lens-client";
import type { AppRouter } from "@/server/router";

export const client = createClient<AppRouter>({
  transport: httpTransport({ url: "/api/lens" }),
});
```

### Usage

```tsx
import { client } from "@/lib/client";

// Component - hook (auto-subscribes, reactive)
function UserProfile({ id }: { id: string }) {
  const { data, loading, error } = client.user.get({
    input: { id },
    select: { name: true, avatar: true },
  });

  if (loading) return <Spinner />;
  return <h1>{data?.name}</h1>;
}

// SSR / Server Component - promise
async function UserPage({ id }: { id: string }) {
  const user = await client.user.get.fetch({
    input: { id },
  });

  return <h1>{user.name}</h1>;
}
```

---

## API Reference

### Query Endpoints

```typescript
// Query (hook) - in component
const { data, loading, error, refetch } = client.user.get({
  input: { id: "123" },           // Query parameters
  select: { name: true },          // Optional field selection
  skip: false,                     // Optional: skip execution
});

// Query (promise) - in SSR/scripts
const user = await client.user.get.fetch({
  input: { id: "123" },
  select: { name: true },
});
```

### Mutation Endpoints

```typescript
// Mutation (hook) - in component
const { mutate, loading, error, data, reset } = client.user.create({
  onSuccess: (data) => toast("Created!"),
  onError: (err) => toast.error(err.message),
});

// Execute mutation
await mutate({
  input: { name: "John", email: "john@example.com" },
  select: { id: true },
});

// Mutation (promise) - in SSR/scripts
const newUser = await client.user.create.fetch({
  input: { name: "John", email: "john@example.com" },
});
```

### Conditional Queries

```tsx
function UserProfile({ id }: { id: string | null }) {
  // Use skip option for conditional queries
  const { data } = client.user.get({
    input: { id: id ?? "" },
    skip: !id,  // Don't execute if no id
  });

  return <div>{data?.name}</div>;
}
```

### Nested Selection with Input

```typescript
const { data } = client.user.get({
  input: { id: "user-123" },
  select: {
    name: true,
    email: true,
    posts: {
      input: { limit: 10, published: true },  // Nested input
      select: {
        title: true,
        content: true,
        comments: {
          input: { limit: 5 },  // Deeply nested input
          select: {
            body: true,
            author: {
              select: { name: true },
            },
          },
        },
      },
    },
  },
});
```

---

## Framework-Specific Details

### React

```tsx
import { createClient } from "@sylphx/lens-react";

export const client = createClient<AppRouter>({ transport });

// In component
function UserProfile({ id }: { id: string }) {
  // Query - returns { data, loading, error, refetch }
  const { data, loading } = client.user.get({ input: { id } });

  // Mutation - returns { mutate, loading, error, data, reset }
  const { mutate, loading: saving } = client.user.update();

  return (
    <div>
      {loading ? <Spinner /> : <h1>{data?.name}</h1>}
      <button onClick={() => mutate({ input: { id, name: "New" } })}>
        {saving ? "Saving..." : "Update"}
      </button>
    </div>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { client } from "@/lib/client";

const props = defineProps<{ id: string }>();

// Query - returns Refs { data, loading, error, refetch }
const { data, loading, error } = client.user.get({
  input: { id: props.id },
  select: { name: true },
});

// Mutation - returns Refs { mutate, loading, error, data }
const { mutate, loading: saving } = client.user.update();

const handleUpdate = async () => {
  await mutate({ input: { id: props.id, name: "New Name" } });
};
</script>

<template>
  <div v-if="loading">Loading...</div>
  <div v-else>
    <h1>{{ data?.name }}</h1>
    <button @click="handleUpdate" :disabled="saving">Update</button>
  </div>
</template>
```

### Solid

```tsx
import { createClient } from "@sylphx/lens-solid";

export const client = createClient<AppRouter>({ transport });

function UserProfile(props: { id: string }) {
  // Query - returns Accessors { data, loading, error, refetch }
  const { data, loading, error } = client.user.get({
    input: { id: props.id },
    select: { name: true },
  });

  // Mutation - returns { mutate, loading, error, data }
  const { mutate, loading: saving } = client.user.update();

  return (
    <Show when={!loading()} fallback={<Spinner />}>
      <h1>{data()?.name}</h1>
      <button
        onClick={() => mutate({ input: { id: props.id, name: "New" } })}
        disabled={saving()}
      >
        Update
      </button>
    </Show>
  );
}
```

### Svelte

```svelte
<script lang="ts">
  import { client } from "$lib/client";

  export let id: string;

  // Query - returns store with { data, loading, error } + refetch method
  $: userQuery = client.user.get({
    input: { id },
    select: { name: true },
  });

  // Mutation - returns store with { loading, error, data } + mutate method
  const updateMutation = client.user.update();

  const handleUpdate = async () => {
    await updateMutation.mutate({ input: { id, name: "New Name" } });
  };
</script>

{#if $userQuery.loading}
  <p>Loading...</p>
{:else if $userQuery.error}
  <p>Error: {$userQuery.error.message}</p>
{:else}
  <h1>{$userQuery.data?.name}</h1>
  <button on:click={handleUpdate} disabled={$updateMutation.loading}>
    Update
  </button>
{/if}
```

---

## Type Definitions

### Query Hook Result

```typescript
interface QueryHookResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### Mutation Hook Result

```typescript
interface MutationHookResult<TInput, TOutput> {
  mutate: (options: { input: TInput; select?: SelectionObject }) => Promise<TOutput>;
  loading: boolean;
  error: Error | null;
  data: TOutput | null;
  reset: () => void;
}
```

### Query Options

```typescript
interface QueryOptions<TInput, TSelect> {
  input?: TInput;                    // Query parameters (required if endpoint needs input)
  select?: TSelect;                  // Field selection (optional)
  skip?: boolean;                    // Skip query execution (optional)
}
```

### Mutation Hook Options

```typescript
interface MutationHookOptions<TOutput> {
  onSuccess?: (data: TOutput) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
}
```

### TypedClient

```typescript
type TypedClient<TRouter> = {
  [K in keyof TRouter]:
    TRouter[K] extends QueryDefinition<infer TIn, infer TOut>
      ? QueryEndpoint<TIn, TOut>
      : TRouter[K] extends MutationDefinition<infer TIn, infer TOut>
        ? MutationEndpoint<TIn, TOut>
        : TypedClient<TRouter[K]>  // Nested routes
};

interface QueryEndpoint<TInput, TOutput> {
  // Hook call (in component)
  <TSelect extends SelectionObject = {}>(
    options: QueryOptions<TInput, TSelect>
  ): QueryHookResult<TSelect extends {} ? SelectedType<TOutput, TSelect> : TOutput>;

  // Promise call (SSR)
  fetch<TSelect extends SelectionObject = {}>(
    options: QueryOptions<TInput, TSelect>
  ): Promise<TSelect extends {} ? SelectedType<TOutput, TSelect> : TOutput>;
}

interface MutationEndpoint<TInput, TOutput> {
  // Hook call (in component)
  (options?: MutationHookOptions<TOutput>): MutationHookResult<TInput, TOutput>;

  // Promise call (SSR)
  fetch<TSelect extends SelectionObject = {}>(
    options: { input: TInput; select?: TSelect }
  ): Promise<TSelect extends {} ? SelectedType<TOutput, TSelect> : TOutput>;
}
```

---

## Migration Guide

### From v3 to v4

#### Setup

```typescript
// v3 - Two layers
import { createClient } from "@sylphx/lens-client";
import { createLensReact } from "@sylphx/lens-react";

const baseClient = createClient<AppRouter>({ transport });
const { useQuery, useMutation, LensProvider } = createLensReact(baseClient);

// v4 - One layer
import { createClient } from "@sylphx/lens-react";

const client = createClient<AppRouter>({ transport });
```

#### Query Usage

```typescript
// v3 - useQuery with selector
const { data } = useQuery(
  (client) => client.user.get,
  { id: userId },
  { select: (user) => user.name }
);

// v4 - Direct call
const { data } = client.user.get({
  input: { id: userId },
  select: { name: true },
});
```

#### Mutation Usage

```typescript
// v3 - useMutation with selector
const { mutate } = useMutation((client) => client.user.create);
await mutate({ name: "John" });

// v4 - Direct call
const { mutate } = client.user.create();
await mutate({ input: { name: "John" } });
```

#### SSR Usage

```typescript
// v3 - Use base client
const user = await baseClient.user.get({ id });

// v4 - Use .fetch()
const user = await client.user.get.fetch({ input: { id } });
```

---

## Breaking Changes from v3

1. **No separate hook functions**: `useQuery`, `useMutation` removed - use direct calls
2. **No LensProvider needed**: Client works without React context (unless you need SSR hydration)
3. **`.fetch()` for promises**: SSR uses `client.xxx.fetch()` instead of separate client
4. **Mutation requires `.mutate()`**: The hook returns `{ mutate }`, call `mutate({ input })` to execute

---

## Package Exports

Each framework package exports `createClient`:

```typescript
// React
import { createClient } from "@sylphx/lens-react";

// Vue
import { createClient } from "@sylphx/lens-vue";

// Solid
import { createClient } from "@sylphx/lens-solid";

// Svelte
import { createClient } from "@sylphx/lens-svelte";

// Pure (no hooks, promise-only)
import { createClient } from "@sylphx/lens-client";
```

The pure `@sylphx/lens-client` version only has promise-based methods (no hooks).

---

## Implementation Notes

### Proxy Architecture

The client uses JavaScript Proxy to:
1. Create nested route accessors dynamically
2. Detect endpoint type (query vs mutation) at runtime
3. Return appropriate hook or promise based on call pattern

### Hook Caching

Hook functions are cached to maintain stable references across re-renders:
```typescript
// Internally, lens.user.get always returns the same function reference
const hook1 = client.user.get;
const hook2 = client.user.get;
console.log(hook1 === hook2); // true
```

### Reactive Dependencies

- **React**: Uses `useMemo` + `useEffect` with JSON-serialized options as deps
- **Vue**: Uses `watchEffect` to track reactive dependencies
- **Solid**: Uses `createEffect` to track signal dependencies
- **Svelte**: Uses reactive statements (`$:`) or derived stores
