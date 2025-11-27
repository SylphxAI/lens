# @sylphx/lens-react

React hooks for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-react
```

## Usage

```typescript
import { LensProvider, useQuery, useMutation } from "@sylphx/lens-react";
import { client } from "./client";

function App() {
  return (
    <LensProvider client={client}>
      <UserProfile />
    </LensProvider>
  );
}

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
