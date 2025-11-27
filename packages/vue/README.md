# @sylphx/lens-vue

Vue composables for the Lens API framework.

## Installation

```bash
bun add @sylphx/lens-vue
```

## Usage

```typescript
import { provideLensClient, useQuery, useMutation } from "@sylphx/lens-vue";
import { client } from "./client";

// In parent component
provideLensClient(client);

// In child component
const { data, loading, error } = useQuery(() => client.user.get({ id: "1" }));
const { mutate, loading: creating } = useMutation(client.user.create);
```

## License

MIT
