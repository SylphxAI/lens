# @sylphx/lens-client

Type-safe client for the Lens API framework with real-time subscriptions.

## Installation

```bash
bun add @sylphx/lens-client
```

## Usage

```typescript
import { createClient, WebSocketTransport } from "@sylphx/lens-client";
import type { AppRouter } from "./server";

const client = createClient<AppRouter>({
  transport: new WebSocketTransport("ws://localhost:3000"),
});

// Query
const user = await client.user.get({ id: "1" });

// Mutation
const result = await client.user.create({ name: "John", email: "john@example.com" });

// Subscription
client.user.get({ id: "1" }).subscribe((user) => {
  console.log("User updated:", user);
});
```

## License

MIT
