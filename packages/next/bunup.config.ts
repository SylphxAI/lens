import { defineConfig } from "bunup";

export default defineConfig({
	entry: ["src/index.ts", "src/server.ts"],
	external: ["react", "next", "@sylphx/lens-react", "@sylphx/lens-client", "@sylphx/lens-server"],
});
