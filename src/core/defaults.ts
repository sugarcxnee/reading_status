import { CURRENT_SCHEMA_VERSION } from "./types";
import type { PluginData, PluginSettings } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
	chapterLevel: 2,
	dedupeWindowMs: 300_000,
	idleThresholdMs: 60_000,
	showStatusBar: true,
	excludedPaths: [],
	dataRetentionDays: 0,
};

export function createDefaultSettings(): PluginSettings {
	return structuredClone(DEFAULT_SETTINGS);
}

export function createDefaultData(): PluginData {
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		settings: createDefaultSettings(),
		notes: {},
		days: {},
	};
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
	return isFiniteNumber(value) && Number.isInteger(value) && value >= min && value <= max;
}

function isNonNegativeInteger(value: unknown): value is number {
	return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isPositiveNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}

/**
 * Merge persisted settings over the defaults. Values with unexpected types
 * fall back to the default so that hand-edited data never breaks the plugin.
 */
export function mergeSettings(stored: unknown): PluginSettings {
	const merged = createDefaultSettings();
	if (typeof stored !== "object" || stored === null) {
		return merged;
	}
	const source = stored as Record<string, unknown>;
	if (isIntegerInRange(source.chapterLevel, 1, 6)) {
		merged.chapterLevel = source.chapterLevel;
	}
	if (isPositiveNumber(source.dedupeWindowMs)) {
		merged.dedupeWindowMs = source.dedupeWindowMs;
	}
	if (isPositiveNumber(source.idleThresholdMs)) {
		merged.idleThresholdMs = source.idleThresholdMs;
	}
	if (typeof source.showStatusBar === "boolean") {
		merged.showStatusBar = source.showStatusBar;
	}
	if (Array.isArray(source.excludedPaths)) {
		const paths = source.excludedPaths.filter(
			(entry): entry is string => typeof entry === "string" && entry.length > 0,
		);
		if (paths.length > 0) {
			merged.excludedPaths = paths;
		}
	}
	if (isNonNegativeInteger(source.dataRetentionDays)) {
		merged.dataRetentionDays = source.dataRetentionDays;
	}
	return merged;
}
