# @sylphx/lens-next

Next.js integration for the Lens API framework with SSR support.

## Installation

```bash
bun add @sylphx/lens-next
```

## Usage

```typescript
// app/providers.tsx
"use client";

import { LensProvider } from "@sylphx/lens-next";
import { client } from "./client";

export function Providers({ children }) {
  return <LensProvider client={client}>{children}</LensProvider>;
}

// app/page.tsx
import { useQuery } from "@sylphx/lens-next";
import { client } from "./client";

export default function Page() {
  const { data, loading } = useQuery(client.user.get({ id: "1" }));
  return <div>{data?.name}</div>;
}
```

## License

MIT
