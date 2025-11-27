# @sylphx/lens-preact

Preact hooks and signals for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-preact
```

## Usage

```typescript
import { useQuery, useMutation } from "@sylphx/lens-preact";
import { client } from "./client";

function UserProfile() {
  const { data, loading, error } = useQuery(client.user.get({ id: "1" }));
  const [createUser, { loading: creating }] = useMutation(client.user.create);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{data.name}</div>;
}
```

## License

MIT
