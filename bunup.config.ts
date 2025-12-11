import { defineWorkspace } from "bunup";

export default defineWorkspace([
	{
		name: "core",
		root: "packages/core",
		target: "browser", // Must be browser-compatible (used by client packages)
	},
	{
		name: "client",
		root: "packages/client",
		target: "browser",
	},
	{
		name: "server",
		root: "packages/server",
		target: "node",
	},
	{
		name: "lens",
		root: "packages/lens",
		target: "browser", // Umbrella package, should be browser-compatible
	},
	{
		name: "react",
		root: "packages/react",
		target: "browser",
	},
	{
		name: "vue",
		root: "packages/vue",
		target: "browser",
	},
	{
		name: "svelte",
		root: "packages/svelte",
		target: "browser",
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
