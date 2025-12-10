import { defineConfig } from "vitepress";

export default defineConfig({
	title: "Lens",
	description: "Type-safe, real-time API framework for TypeScript",

	head: [
		["link", { rel: "icon", href: "/logo.svg" }],
		["meta", { name: "theme-color", content: "#646cff" }],
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:title", content: "Lens" }],
		[
			"meta",
			{ property: "og:description", content: "Type-safe, real-time API framework for TypeScript" },
		],
		["meta", { property: "og:url", content: "https://lens.sylphx.com" }],
	],

	themeConfig: {
		logo: "/logo.svg",

		nav: [
			{ text: "Guide", link: "/guide/" },
			{ text: "Server", link: "/server/" },
			{ text: "Client", link: "/client/" },
			{ text: "Frameworks", link: "/frameworks/react" },
			{ text: "API", link: "/api/server" },
			{
				text: "Resources",
				items: [
					{ text: "Examples", link: "/examples/basic" },
					{ text: "Advanced", link: "/advanced/architecture" },
					{ text: "GitHub", link: "https://github.com/SylphxAI/Lens" },
				],
			},
		],

		sidebar: {
			"/guide/": [
				{
					text: "Introduction",
					items: [
						{ text: "What is Lens?", link: "/guide/" },
						{ text: "Installation", link: "/guide/installation" },
						{ text: "Quick Start", link: "/guide/quick-start" },
					],
				},
				{
					text: "Core Concepts",
					items: [
						{ text: "Live Queries", link: "/guide/concepts" },
						{ text: "Comparison", link: "/guide/comparison" },
					],
				},
			],
			"/server/": [
				{
					text: "Server Basics",
					items: [
						{ text: "Overview", link: "/server/" },
						{ text: "Models", link: "/server/models" },
						{ text: "Operations", link: "/server/operations" },
						{ text: "Router", link: "/server/router" },
					],
				},
				{
					text: "Advanced",
					items: [
						{ text: "Resolvers", link: "/server/resolvers" },
						{ text: "Live Queries", link: "/server/live-queries" },
						{ text: "Context", link: "/server/context" },
						{ text: "Plugins", link: "/server/plugins" },
					],
				},
			],
			"/client/": [
				{
					text: "Client",
					items: [
						{ text: "Overview", link: "/client/" },
						{ text: "Transports", link: "/client/transports" },
						{ text: "Field Selection", link: "/client/selection" },
						{ text: "Subscriptions", link: "/client/subscriptions" },
						{ text: "Optimistic Updates", link: "/client/optimistic" },
						{ text: "Plugins", link: "/client/plugins" },
					],
				},
			],
			"/frameworks/": [
				{
					text: "Frameworks",
					items: [
						{ text: "React", link: "/frameworks/react" },
						{ text: "Vue", link: "/frameworks/vue" },
						{ text: "SolidJS", link: "/frameworks/solid" },
						{ text: "Svelte", link: "/frameworks/svelte" },
					],
				},
				{
					text: "Meta-Frameworks",
					items: [
						{ text: "Next.js", link: "/frameworks/next" },
						{ text: "Nuxt", link: "/frameworks/nuxt" },
						{ text: "Fresh", link: "/frameworks/fresh" },
					],
				},
			],
			"/advanced/": [
				{
					text: "Advanced",
					items: [
						{ text: "Architecture", link: "/advanced/architecture" },
						{ text: "Two-Phase Resolution", link: "/advanced/two-phase" },
						{ text: "Emit API", link: "/advanced/emit-api" },
						{ text: "Storage Adapters", link: "/advanced/storage" },
						{ text: "TypeScript Patterns", link: "/advanced/typescript" },
					],
				},
			],
			"/examples/": [
				{
					text: "Examples",
					items: [
						{ text: "Basic", link: "/examples/basic" },
						{ text: "Real-time Dashboard", link: "/examples/realtime-dashboard" },
						{ text: "AI Chat Streaming", link: "/examples/ai-chat" },
						{ text: "Collaborative Editing", link: "/examples/collaborative" },
					],
				},
			],
			"/api/": [
				{
					text: "API Reference",
					items: [
						{ text: "Server API", link: "/api/server" },
						{ text: "Client API", link: "/api/client" },
						{ text: "Core Types", link: "/api/core" },
					],
				},
			],
		},

		socialLinks: [{ icon: "github", link: "https://github.com/SylphxAI/Lens" }],

		search: {
			provider: "local",
		},

		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2024 Sylphx AI",
		},

		editLink: {
			pattern: "https://github.com/SylphxAI/Lens/edit/main/website/:path",
			text: "Edit this page on GitHub",
		},
	},
});
