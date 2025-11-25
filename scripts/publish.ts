#!/usr/bin/env bun

/**
 * Custom publish script that resolves workspace:* dependencies before publishing
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";

const PACKAGES_DIR = join(import.meta.dir, "../packages");

// Get all package directories
const packages = readdirSync(PACKAGES_DIR, { withFileTypes: true })
	.filter((dirent) => dirent.isDirectory())
	.map((dirent) => join(PACKAGES_DIR, dirent.name));

// Build version map from all package.json files
const versionMap = new Map<string, string>();
for (const pkgDir of packages) {
	const pkgJsonPath = join(pkgDir, "package.json");
	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
	versionMap.set(pkgJson.name, pkgJson.version);
}

console.log("📦 Resolving workspace:* dependencies...");
console.log("Version map:", Object.fromEntries(versionMap));

// Update all package.json files to replace workspace:* with actual versions
for (const pkgDir of packages) {
	const pkgJsonPath = join(pkgDir, "package.json");
	const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));

	let modified = false;

	// Replace workspace:* in dependencies
	if (pkgJson.dependencies) {
		for (const [dep, version] of Object.entries(pkgJson.dependencies)) {
			if (version === "workspace:*" && versionMap.has(dep)) {
				pkgJson.dependencies[dep] = `^${versionMap.get(dep)}`;
				modified = true;
				console.log(`  ${pkgJson.name}: ${dep}: workspace:* -> ^${versionMap.get(dep)}`);
			}
		}
	}

	// Replace workspace:* in devDependencies
	if (pkgJson.devDependencies) {
		for (const [dep, version] of Object.entries(pkgJson.devDependencies)) {
			if (version === "workspace:*" && versionMap.has(dep)) {
				pkgJson.devDependencies[dep] = `^${versionMap.get(dep)}`;
				modified = true;
				console.log(`  ${pkgJson.name}: ${dep}: workspace:* -> ^${versionMap.get(dep)}`);
			}
		}
	}

	// Replace workspace:* in peerDependencies
	if (pkgJson.peerDependencies) {
		for (const [dep, version] of Object.entries(pkgJson.peerDependencies)) {
			if (version === "workspace:*" && versionMap.has(dep)) {
				pkgJson.peerDependencies[dep] = `^${versionMap.get(dep)}`;
				modified = true;
				console.log(`  ${pkgJson.name}: ${dep}: workspace:* -> ^${versionMap.get(dep)}`);
			}
		}
	}

	if (modified) {
		writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
	}
}

console.log("✅ Workspace dependencies resolved!");
console.log("🚀 Publishing packages...");

// Run changeset publish
await $`changeset publish`;

console.log("✅ Packages published!");
