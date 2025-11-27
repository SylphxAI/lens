# @sylphx/lens-solid

Solid.js primitives for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-solid
```

## Usage

```typescript
import { createQuery, createMutation } from "@sylphx/lens-solid";
import { client } from "./client";

function UserProfile() {
  const user = createQuery(() => client.user.get({ id: "1" }));
  const createUser = createMutation(client.user.create);

  return (
    <Show when={!user.loading} fallback={<div>Loading...</div>}>
      <div>{user.data?.name}</div>
    </Show>
  );
}
```

## License

MIT
