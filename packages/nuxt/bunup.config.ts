import { defineConfig } from "bunup";

export default defineConfig({
	entry: ["src/index.ts"],
	external: ["vue", "nuxt", "@sylphx/lens-vue", "@sylphx/lens-client"],
});
