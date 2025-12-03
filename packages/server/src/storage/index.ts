/**
 * @sylphx/lens-server - Storage
 *
 * Storage adapters for opLog plugin.
 */

export { memoryStorage } from "./memory.js";
export {
	DEFAULT_STORAGE_CONFIG,
	type EmitResult,
	type OpLogStorage,
	type OpLogStorageConfig,
	type StoredEntityState,
	type StoredPatchEntry,
} from "./types.js";
