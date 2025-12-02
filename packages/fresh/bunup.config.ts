import { defineConfig } from "bunup";

export default defineConfig({
	entry: ["src/index.ts", "src/islands.ts"],
	external: [
		"preact",
		"@preact/signals",
		"@sylphx/reify",
		"@sylphx/lens-preact",
		"@sylphx/lens-client",
		"@sylphx/lens-server",
	],
});
