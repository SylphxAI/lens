# @sylphx/lens-solidstart

SolidStart integration for the Lens API framework with SSR support.

## Installation

```bash
bun add @sylphx/lens-solidstart
```

## Usage

```typescript
import { createQuery, createMutation } from "@sylphx/lens-solidstart";
import { client } from "./client";

export default function Page() {
  const user = createQuery(() => client.user.get({ id: "1" }));

  return (
    <Show when={!user.loading} fallback={<div>Loading...</div>}>
      <div>{user.data?.name}</div>
    </Show>
  );
}
```

## License

MIT
