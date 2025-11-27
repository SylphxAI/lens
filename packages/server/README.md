# @sylphx/lens-server

Server runtime for the Lens API framework with WebSocket support.

## Installation

```bash
bun add @sylphx/lens-server
```

## Usage

```typescript
import { createServer } from "@sylphx/lens-server";
import { appRouter } from "./router";

const server = createServer({ router: appRouter });

// Handle WebSocket connections
Bun.serve({
  port: 3000,
  fetch: server.fetch,
  websocket: server.websocket,
});
```

## License

MIT
