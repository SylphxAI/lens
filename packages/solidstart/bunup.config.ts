import { defineConfig } from "bunup";

export default defineConfig({
	entry: ["src/index.ts"],
	external: ["solid-js", "@solidjs/start", "@solidjs/router", "@sylphx/reify"],
});
