import { defineConfig } from "vitepress";

const SITE_URL = "https://lens.sylphx.com";
const SITE_TITLE = "Lens";
const SITE_DESCRIPTION =
	"Type-safe, real-time API framework for TypeScript. GraphQL-like power with automatic live queries, incremental transfer, and full type inference. No codegen required.";

export default defineConfig({
	title: SITE_TITLE,
	description: SITE_DESCRIPTION,
	lang: "en-US",
	cleanUrls: true,
	lastUpdated: true,

	sitemap: {
		hostname: SITE_URL,
		transformItems: (items) => {
			return items.map((item) => ({
				...item,
				changefreq: "weekly",
				priority: item.url === "" ? 1.0 : item.url.includes("/guide/") ? 0.9 : 0.8,
			}));
		},
	},

	head: [
		// Favicon & Icons
		["link", { rel: "icon", href: "/logo.svg", type: "image/svg+xml" }],
		["link", { rel: "icon", href: "/favicon.ico", sizes: "32x32" }],
		["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" }],
		["link", { rel: "manifest", href: "/site.webmanifest" }],

		// Theme & Mobile
		["meta", { name: "theme-color", content: "#646cff" }],
		["meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }],
		["meta", { name: "mobile-web-app-capable", content: "yes" }],
		["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
		["meta", { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" }],

		// SEO Meta
		["meta", { name: "author", content: "Sylphx AI" }],
		[
			"meta",
			{
				name: "keywords",
				content:
					"lens, typescript, api, real-time, live queries, websocket, type-safe, graphql, trpc, framework, react, vue, solid, svelte",
			},
		],
		["meta", { name: "robots", content: "index, follow" }],
		["meta", { name: "googlebot", content: "index, follow" }],
		["link", { rel: "canonical", href: SITE_URL }],

		// Open Graph
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:site_name", content: SITE_TITLE }],
		["meta", { property: "og:title", content: SITE_TITLE }],
		["meta", { property: "og:description", content: SITE_DESCRIPTION }],
		["meta", { property: "og:url", content: SITE_URL }],
		["meta", { property: "og:image", content: `${SITE_URL}/og-image.png` }],
		["meta", { property: "og:image:width", content: "1200" }],
		["meta", { property: "og:image:height", content: "630" }],
		["meta", { property: "og:image:alt", content: "Lens - Type-safe, real-time API framework" }],
		["meta", { property: "og:locale", content: "en_US" }],

		// Twitter Card
		["meta", { name: "twitter:card", content: "summary_large_image" }],
		["meta", { name: "twitter:site", content: "@sylphxai" }],
		["meta", { name: "twitter:creator", content: "@sylphxai" }],
		["meta", { name: "twitter:title", content: SITE_TITLE }],
		["meta", { name: "twitter:description", content: SITE_DESCRIPTION }],
		["meta", { name: "twitter:image", content: `${SITE_URL}/og-image.png` }],
		["meta", { name: "twitter:image:alt", content: "Lens - Type-safe, real-time API framework" }],

		// JSON-LD Structured Data
		[
			"script",
			{ type: "application/ld+json" },
			JSON.stringify({
				"@context": "https://schema.org",
				"@type": "SoftwareApplication",
				name: "Lens",
				description: SITE_DESCRIPTION,
				url: SITE_URL,
				applicationCategory: "DeveloperApplication",
				operatingSystem: "Cross-platform",
				offers: {
					"@type": "Offer",
					price: "0",
					priceCurrency: "USD",
				},
				author: {
					"@type": "Organization",
					name: "Sylphx AI",
					url: "https://sylphx.com",
				},
				license: "https://opensource.org/licenses/MIT",
				programmingLanguage: "TypeScript",
				runtimePlatform: "Node.js",
			}),
		],
	],

	transformPageData(pageData) {
		// Dynamic canonical URL per page
		const canonicalUrl = `${SITE_URL}/${pageData.relativePath}`
			.replace(/index\.md$/, "")
			.replace(/\.md$/, "");

		pageData.frontmatter.head ??= [];
		pageData.frontmatter.head.push(["link", { rel: "canonical", href: canonicalUrl }]);

		// Dynamic OG URL per page
		pageData.frontmatter.head.push(["meta", { property: "og:url", content: canonicalUrl }]);

		// Dynamic title for OG
		const pageTitle = pageData.title ? `${pageData.title} | ${SITE_TITLE}` : SITE_TITLE;
		pageData.frontmatter.head.push(["meta", { property: "og:title", content: pageTitle }]);
		pageData.frontmatter.head.push(["meta", { name: "twitter:title", content: pageTitle }]);
	},

	themeConfig: {
		logo: "/logo.svg",
		siteTitle: "Lens",

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

		socialLinks: [
			{ icon: "github", link: "https://github.com/SylphxAI/Lens" },
			{ icon: "twitter", link: "https://twitter.com/sylphxai" },
		],

		search: {
			provider: "local",
			options: {
				detailedView: true,
			},
		},

		footer: {
			message: "Released under the MIT License.",
			copyright: "Copyright © 2024-present Sylphx AI",
		},

		editLink: {
			pattern: "https://github.com/SylphxAI/Lens/edit/main/website/:path",
			text: "Edit this page on GitHub",
		},

		lastUpdated: {
			text: "Last updated",
			formatOptions: {
				dateStyle: "medium",
			},
		},

		outline: {
			level: [2, 3],
			label: "On this page",
		},

		docFooter: {
			prev: "Previous",
			next: "Next",
		},

		returnToTopLabel: "Return to top",
		sidebarMenuLabel: "Menu",
		darkModeSwitchLabel: "Theme",
		lightModeSwitchTitle: "Switch to light theme",
		darkModeSwitchTitle: "Switch to dark theme",
	},
});
