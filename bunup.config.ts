import { defineWorkspace } from "bunup";

export default defineWorkspace([
	{
		name: "core",
		root: "packages/core",
	},
	{
		name: "client",
		root: "packages/client",
	},
	{
		name: "server",
		root: "packages/server",
	},
	{
		name: "lens",
		root: "packages/lens",
	},
	{
		name: "react",
		root: "packages/react",
	},
	{
		name: "vue",
		root: "packages/vue",
	},
	{
		name: "svelte",
		root: "packages/svelte",
	},
	// JSX packages excluded due to bunup v0.16.10 bug with JSX/TSX files
	// They use bun build + tsc in package.json instead:
	// - packages/solid (Solid.js primitives)
	// - packages/preact (Preact hooks & signals)
	// - packages/solidstart (SolidStart integration)
	// - packages/fresh (Fresh/Deno integration)
	// - packages/next (Next.js integration)
	// - packages/nuxt (Nuxt integration)
]);
