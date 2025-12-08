# Lens API v4 Design

## Overview

This document outlines the unified API for Lens. The key principle: **vanilla JS base + explicit framework hooks**.

## Core Principles

1. **Unified Base Client**: Direct calls always return Promise/Observable (vanilla JS)
2. **Explicit Hooks**: `.useQuery()` / `.useMutation()` for React/Vue
3. **Explicit Primitives**: `.createQuery()` / `.createMutation()` for Svelte/Solid
4. **No Magic**: Clear distinction between vanilla JS and framework-specific code
5. **Type Safety**: Full TypeScript inference from router to component

---

## Quick Start

### Setup (one-time)

```typescript
// lib/client.ts
import { createClient } from "@sylphx/lens-react"; // or lens-vue, lens-solid, lens-svelte
import { httpTransport } from "@sylphx/lens-client";
import type { AppRouter } from "@/server/router";

export const client = createClient<AppRouter>({
  transport: httpTransport({ url: "/api/lens" }),
});
```

### Usage

```tsx
import { client } from "@/lib/client";

// Vanilla JS (anywhere - SSR, utilities, event handlers)
const user = await client.user.get({ input: { id } });
client.user.get({ input: { id } }).subscribe(data => console.log(data));

// React hooks (in components)
function UserProfile({ id }: { id: string }) {
  const { data, loading, error } = client.user.get.useQuery({
    input: { id },
    select: { name: true, avatar: true },
  });

  if (loading) return <Spinner />;
  return <h1>{data?.name}</h1>;
}
```

---

## API Reference

### Vanilla JS (Base Client)

```typescript
// Query - returns QueryResult (Promise + Observable)
const user = await client.user.get({ input: { id: "123" } });

// Subscribe to live updates
const unsubscribe = client.user.get({ input: { id: "123" } }).subscribe((user) => {
  console.log("User updated:", user);
});

// Mutation - returns Promise
const newUser = await client.user.create({
  input: { name: "John", email: "john@example.com" },
});
```

### React Hooks

```typescript
// Query hook
const { data, loading, error, refetch } = client.user.get.useQuery({
  input: { id: "123" },
  select: { name: true },
  skip: false,
});

// Mutation hook
const { mutate, loading, error, data, reset } = client.user.create.useMutation({
  onSuccess: (data) => toast("Created!"),
  onError: (err) => toast.error(err.message),
});

// Execute mutation
await mutate({
  input: { name: "John", email: "john@example.com" },
  select: { id: true },
});
```

### Vue Composables

```typescript
// Query composable - returns Refs
const { data, loading, error, refetch } = client.user.get.useQuery({
  input: { id: "123" },
});

// Mutation composable
const { mutate, loading, error, data, reset } = client.user.create.useMutation();
```

### Svelte Stores

```typescript
// Query store
const userStore = client.user.get.createQuery({ input: { id: "123" } });
// Use with $: $userStore.data, $userStore.loading

// Mutation store
const mutation = client.user.create.createMutation();
await mutation.mutate({ input: { name: "John" } });
```

### Solid Primitives

```typescript
// Query primitive - returns Accessors
const { data, loading, error, refetch } = client.user.get.createQuery({
  input: { id: "123" },
});
// Use: data(), loading()

// Mutation primitive
const { mutate, loading, error, data, reset } = client.user.create.createMutation();
```

---

## Framework-Specific Details

### React

```tsx
import { createClient } from "@sylphx/lens-react";

export const client = createClient<AppRouter>({ transport });

function UserProfile({ id }: { id: string }) {
  // .useQuery() - React hook
  const { data, loading } = client.user.get.useQuery({ input: { id } });

  // .useMutation() - React hook
  const { mutate, loading: saving } = client.user.update.useMutation();

  return (
    <div>
      {loading ? <Spinner /> : <h1>{data?.name}</h1>}
      <button onClick={() => mutate({ input: { id, name: "New" } })}>
        {saving ? "Saving..." : "Update"}
      </button>
    </div>
  );
}

// SSR / Server Component - use vanilla JS
async function UserPage({ id }: { id: string }) {
  const user = await client.user.get({ input: { id } });
  return <h1>{user.name}</h1>;
}
```

### Vue

```vue
<script setup lang="ts">
import { client } from "@/lib/client";

const props = defineProps<{ id: string }>();

// .useQuery() - Vue composable, returns Refs
const { data, loading, error } = client.user.get.useQuery({
  input: { id: props.id },
  select: { name: true },
});

// .useMutation() - Vue composable
const { mutate, loading: saving } = client.user.update.useMutation();

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
  // .createQuery() - Solid primitive, returns Accessors
  const { data, loading, error } = client.user.get.createQuery({
    input: { id: props.id },
    select: { name: true },
  });

  // .createMutation() - Solid primitive
  const { mutate, loading: saving } = client.user.update.createMutation();

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

  // .createQuery() - Svelte store
  $: userQuery = client.user.get.createQuery({
    input: { id },
    select: { name: true },
  });

  // .createMutation() - Svelte store
  const updateMutation = client.user.update.createMutation();

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

### Query Hook Result (React/Vue)

```typescript
interface QueryHookResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

### Mutation Hook Result (React/Vue)

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
interface QueryHookOptions<TInput> {
  input?: TInput;
  select?: SelectionObject;
  skip?: boolean;
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

// React/Vue
interface QueryEndpoint<TInput, TOutput> {
  // Vanilla JS - returns QueryResult (Promise + Observable)
  (options?: { input?: TInput; select?: SelectionObject }): QueryResult<TOutput>;

  // React/Vue hook
  useQuery: (options?: QueryHookOptions<TInput>) => QueryHookResult<TOutput>;
}

interface MutationEndpoint<TInput, TOutput> {
  // Vanilla JS - returns Promise
  (options: { input: TInput; select?: SelectionObject }): Promise<{ data: TOutput }>;

  // React/Vue hook
  useMutation: (options?: MutationHookOptions<TOutput>) => MutationHookResult<TInput, TOutput>;
}

// Svelte/Solid use createQuery/createMutation instead
```

---

## Migration Guide

### From v3 to v4

#### Setup (unchanged)

```typescript
import { createClient } from "@sylphx/lens-react";

const client = createClient<AppRouter>({ transport });
```

#### Query Usage

```typescript
// v3 - Direct call was a hook
const { data } = client.user.get({ input: { id } });

// v4 - Direct call is vanilla JS, use .useQuery() for hook
const user = await client.user.get({ input: { id } }); // vanilla JS
const { data } = client.user.get.useQuery({ input: { id } }); // React hook
```

#### Mutation Usage

```typescript
// v3 - Direct call returned hook
const { mutate } = client.user.create();

// v4 - Direct call is vanilla JS, use .useMutation() for hook
const result = await client.user.create({ input: { name: "John" } }); // vanilla JS
const { mutate } = client.user.create.useMutation(); // React hook
```

#### SSR Usage

```typescript
// v3 - Used .fetch()
const user = await client.user.get.fetch({ input: { id } });

// v4 - Direct call works
const user = await client.user.get({ input: { id } });
```

---

## Breaking Changes from v3

1. **Direct calls are now vanilla JS**: `client.user.get({ input })` returns Promise/Observable, not hook
2. **Explicit hooks**: Use `.useQuery()` / `.useMutation()` for React/Vue hooks
3. **Explicit primitives**: Use `.createQuery()` / `.createMutation()` for Svelte/Solid
4. **No `.fetch()` needed**: Direct calls work for SSR

---

## Package Exports

Each framework package exports `createClient`:

```typescript
// React - adds .useQuery() / .useMutation()
import { createClient } from "@sylphx/lens-react";

// Vue - adds .useQuery() / .useMutation()
import { createClient } from "@sylphx/lens-vue";

// Solid - adds .createQuery() / .createMutation()
import { createClient } from "@sylphx/lens-solid";

// Svelte - adds .createQuery() / .createMutation()
import { createClient } from "@sylphx/lens-svelte";

// Pure (no hooks, vanilla JS only)
import { createClient } from "@sylphx/lens-client";
```

---

## Implementation Notes

### Proxy Architecture

The client uses JavaScript Proxy to:
1. Create nested route accessors dynamically
2. Handle direct calls (vanilla JS) via `apply` trap
3. Handle `.useQuery()` / `.useMutation()` via `get` trap
4. Cache hook/primitive factories for stable references

### Hook Caching

Hook functions are cached to maintain stable references across re-renders:
```typescript
// Internally, client.user.get.useQuery always returns the same function reference
const hook1 = client.user.get.useQuery;
const hook2 = client.user.get.useQuery;
console.log(hook1 === hook2); // true
```

### Reactive Dependencies

- **React**: Uses `useMemo` + `useEffect` with JSON-serialized options as deps
- **Vue**: Uses `watchEffect` to track reactive dependencies
- **Solid**: Uses `createEffect` to track signal dependencies
- **Svelte**: Uses reactive statements (`$:`) or stores
