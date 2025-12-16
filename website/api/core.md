# Core API Reference

Complete API reference for `@sylphx/lens-core`.

## Model Definition

### model

Creates a model with type-safe fields.

```typescript
import { lens, id, string, list } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

const User = model('User', {
  id: id(),
  name: string(),
  posts: list(() => Post),
}).resolve({
  posts: ({ source, ctx }) => ...,
})
```

### InferModelType

Extracts TypeScript type from model.

```typescript
import { InferModelType } from '@sylphx/lens-core'

type UserType = InferModelType<typeof User>
// { id: string; name: string; posts: Post[] }
```

## Field Types

### Scalar Types

```typescript
import { id, string, int, float, boolean, date, json } from '@sylphx/lens-core'

id()        // string (unique identifier)
string()    // string
int()       // number (integer)
float()     // number (floating point)
boolean()   // boolean
date()      // Date
json()      // unknown (JSON value)
```

### Enum Type

```typescript
import { enumType } from '@sylphx/lens-core'

enumType(['active', 'inactive', 'pending'])
// Type: 'active' | 'inactive' | 'pending'
```

### Relation Types

```typescript
() => Profile     // Single relation
list(() => Post)  // Array relation
```

## Field Modifiers

### optional

Field can be undefined.

```typescript
import { lens, string } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

model('User', {
  bio: string().optional(),
  // Type: string | undefined
})
```

### nullable

Field can be null.

```typescript
import { lens, date, nullable } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

model('User', {
  deletedAt: nullable(date()),
  // Type: Date | null
})
```

### default

Default value when not provided.

```typescript
import { lens, enumType } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

model('User', {
  role: enumType(['user', 'admin']).default('user'),
})
```

### resolve

Compute field value at runtime.

```typescript
import { lens, string } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

model('User', {
  fullName: string(),
}).resolve({
  fullName: ({ source }) =>
    `${source.firstName} ${source.lastName}`,
})
```

### subscribe

Subscribe to field updates (Publisher pattern).

```typescript
import { lens, string } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

model('User', {
  status: string(),
}).resolve({
  status: ({ source, ctx }) => ctx.cache.get(`status:${source.id}`),
}).subscribe({
  status: ({ source, ctx }) => ({ emit, onCleanup }) => {
    const unsub = ctx.pubsub.on(`status:${source.id}`, emit)
    onCleanup(unsub)
  },
})
```

### args

Define field arguments.

```typescript
import { lens, list } from '@sylphx/lens-core'

const { model } = lens<AppContext>()

model('User', {
  posts: list(() => Post).args(z.object({
    first: z.number().default(10),
    published: z.boolean().optional(),
  })),
}).resolve({
  posts: ({ source, args, ctx }) => ...,
})
```

## Return Type Wrappers

### nullable

Wrap model to allow null return.

```typescript
import { lens, nullable } from '@sylphx/lens-core'

const { query } = lens<AppContext>()

const findUser = query()
  .input(z.object({ email: z.string() }))
  .returns(nullable(User))
  .resolve(...)
```

### list

Wrap model to return array.

```typescript
import { lens, list } from '@sylphx/lens-core'

const { query } = lens<AppContext>()

const listUsers = query()
  .returns(list(User))  // or just [User]
  .resolve(...)
```

## Emit API

### createEmit

Creates an emit handler.

```typescript
import { createEmit } from '@sylphx/lens-core'

const emit = createEmit(handler, isArray)
```

### Emit Methods

```typescript
emit(value)           // Full value
emit.value(value)     // Same as above
emit.merge(partial)   // Merge fields
emit.replace(value)   // Replace entirely

// Array operations
emit.push(item)
emit.unshift(item)
emit.insert(index, item)
emit.remove(index)
emit.update(index, item)
```

## Temp IDs

### tempId

Generate temporary ID for optimistic updates.

```typescript
import { tempId } from '@sylphx/lens-core'

const id = tempId()
// "temp_abc123..."
```

### isTempId

Check if ID is temporary.

```typescript
import { isTempId } from '@sylphx/lens-core'

if (isTempId(item.id)) {
  // Show pending indicator
}
```

## Type Guards

### isQueryDef

```typescript
import { isQueryDef } from '@sylphx/lens-core'

if (isQueryDef(operation)) {
  // It's a query
}
```

### isMutationDef

```typescript
import { isMutationDef } from '@sylphx/lens-core'

if (isMutationDef(operation)) {
  // It's a mutation
}
```

### isModelDef

```typescript
import { isModelDef } from '@sylphx/lens-core'

if (isModelDef(entity)) {
  // It's a model
}
```

## Utility Functions

### flattenRouter

Flatten router into path-procedure pairs.

```typescript
import { flattenRouter } from '@sylphx/lens-core'

const flattened = flattenRouter(appRouter)
// Map<string, QueryDef | MutationDef>
// "user.get" => QueryDef
// "user.create" => MutationDef
```

### hashValue

Hash a value for comparison.

```typescript
import { hashValue } from '@sylphx/lens-core'

const hash = hashValue({ name: 'Alice', age: 30 })
```

### valuesEqual

Compare two values for equality.

```typescript
import { valuesEqual } from '@sylphx/lens-core'

const equal = valuesEqual(value1, value2, hash1, hash2)
```

## Types

### ContextValue

```typescript
type ContextValue = Record<string, unknown>
```

### ModelDef

```typescript
interface ModelDef<Name extends string = string, Fields = unknown> {
  _name: Name
  _fields: Fields
  _builder: ModelBuilder<Fields>
}
```

### QueryDef

```typescript
interface QueryDef<TInput = unknown, TOutput = unknown, TContext = unknown> {
  _type: 'query'
  _input?: ZodSchema<TInput>
  _output?: TOutput
  _resolve: ResolverFn<TInput, TOutput, TContext>
  _subscriber?: PublisherResolverFn<TInput, TOutput, TContext>
}
```

### MutationDef

```typescript
interface MutationDef<TInput = unknown, TOutput = unknown, TContext = unknown> {
  _type: 'mutation'
  _input?: ZodSchema<TInput>
  _output?: TOutput
  _resolve: ResolverFn<TInput, TOutput, TContext>
  _optimistic?: (ctx: { input: TInput }) => TOutput
}
```

### RouterDef

```typescript
type RouterDef = {
  [key: string]: QueryDef | MutationDef | RouterDef
}
```

### Emit

```typescript
interface Emit<T> {
  (value: T): void
  value(value: T): void
  replace(value: T): void
  merge(partial: Partial<T>): void
  push(item: T extends (infer U)[] ? U : never): void
  unshift(item: T extends (infer U)[] ? U : never): void
  insert(index: number, item: T extends (infer U)[] ? U : never): void
  remove(index: number): void
  update(index: number, item: T extends (infer U)[] ? U : never): void
}
```

### Observable

```typescript
interface Observable<T> {
  subscribe(observer: Observer<T> | ((value: T) => void)): Unsubscribable
}
```
