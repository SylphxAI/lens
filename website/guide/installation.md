# Installation

## Core Packages

```bash
# Core packages
npm install @sylphx/lens-server @sylphx/lens-client

# Or with bun
bun add @sylphx/lens-server @sylphx/lens-client
```

## Framework Adapters

Pick the adapter for your frontend framework:

::: code-group

```bash [React]
npm install @sylphx/lens-react
```

```bash [Vue]
npm install @sylphx/lens-vue
```

```bash [SolidJS]
npm install @sylphx/lens-solid
```

```bash [Svelte]
npm install @sylphx/lens-svelte
```

```bash [Preact]
npm install @sylphx/lens-preact
```

:::

## Meta-Framework Integrations

For SSR and full-stack frameworks:

::: code-group

```bash [Next.js]
npm install @sylphx/lens-next
```

```bash [Nuxt]
npm install @sylphx/lens-nuxt
```

```bash [SolidStart]
npm install @sylphx/lens-solidstart
```

```bash [Fresh (Deno)]
npm install @sylphx/lens-fresh
```

:::

## All-in-One Package

For simpler setups, use the all-in-one package:

```bash
npm install @sylphx/lens
```

This includes server, client, and core packages.

## Requirements

- **Node.js** 18+ or **Bun** 1.0+
- **TypeScript** 5.0+ (recommended)
- **Zod** for input validation

## Package Overview

| Package | Description |
|---------|-------------|
| `@sylphx/lens-server` | Server, router, operations |
| `@sylphx/lens-client` | Client, transports, plugins |
| `@sylphx/lens-core` | Core types and utilities |
| `@sylphx/lens-react` | React hooks |
| `@sylphx/lens-vue` | Vue composables |
| `@sylphx/lens-solid` | SolidJS primitives |
| `@sylphx/lens-svelte` | Svelte stores |
| `@sylphx/lens-preact` | Preact hooks + signals |
| `@sylphx/lens-next` | Next.js integration |
| `@sylphx/lens-nuxt` | Nuxt 3 integration |
| `@sylphx/lens-solidstart` | SolidStart integration |
| `@sylphx/lens-fresh` | Fresh (Deno) integration |
