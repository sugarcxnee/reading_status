import { migrate, ValidationError } from "./migrate";
import type { PluginData } from "./types";

/** Serialize data for export as pretty-printed JSON. */
export function serializeExport(data: PluginData): string {
	return JSON.stringify(data, null, 2);
}

/**
 * Parse and validate imported JSON. Accepts older schema versions (they are
 * migrated) and throws ValidationError for invalid JSON, unusable shapes or
 * newer schema versions.
 */
export function parseImport(text: string): PluginData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ValidationError(`Invalid JSON: ${message}`);
	}
	return migrate(parsed);
}
