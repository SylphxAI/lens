# @sylphx/lens-fresh

Deno Fresh integration for the Lens API framework.

## Installation

```bash
deno add @sylphx/lens-fresh
```

## Usage

```typescript
// routes/index.tsx
import { fetchQuery } from "@sylphx/lens-fresh";
import { client } from "../client.ts";

export default async function Home() {
  const user = await fetchQuery(client.user.get({ id: "1" }));
  return <div>{user.name}</div>;
}
```

## License

MIT
