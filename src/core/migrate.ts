import { createDefaultData } from "./defaults";
import { mergeSettings } from "./defaults";
import { CURRENT_SCHEMA_VERSION } from "./types";
import type { DayReadingRecord, NoteReadingRecord, PluginData } from "./types";

export class ValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ValidationError";
	}
}

/** Migration from schema version N to N+1, keyed by source version. */
type MigrationStep = (data: Record<string, unknown>) => Record<string, unknown>;

const migrationSteps: Record<number, MigrationStep> = {
	// v0 data predates the schemaVersion field. Notes already carry every
	// field except readSections, which sanitizeNotes fills in below.
	0: (data) => ({ ...data, schemaVersion: 1 }),
};

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
	return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function fieldOrDefault(value: unknown, defaultValue: number): unknown {
	return value === undefined ? defaultValue : value;
}

function sanitizeNoteRecord(value: unknown): NoteReadingRecord | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const openCount = fieldOrDefault(record.openCount, 0);
	const totalReadingMs = fieldOrDefault(record.totalReadingMs, 0);
	const firstReadAt = fieldOrDefault(record.firstReadAt, 0);
	const lastReadAt = fieldOrDefault(record.lastReadAt, 0);
	if (
		!isNonNegativeInteger(openCount) ||
		!isNonNegativeInteger(totalReadingMs) ||
		!isFiniteNumber(firstReadAt) ||
		!isFiniteNumber(lastReadAt)
	) {
		return null;
	}
	const maxProgress = isFiniteNumber(record.maxProgress)
		? Math.min(1, Math.max(0, record.maxProgress))
		: 0;
	const readSections = Array.isArray(record.readSections)
		? record.readSections.filter(
				(entry): entry is string => typeof entry === "string" && entry.length > 0,
			)
		: [];
	return {
		openCount,
		totalReadingMs,
		firstReadAt,
		lastReadAt,
		maxProgress,
		readSections,
	};
}

function sanitizeDayRecord(value: unknown): DayReadingRecord | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	const record = value as Record<string, unknown>;
	if (!isNonNegativeInteger(record.readingMs) || !isNonNegativeInteger(record.openCount)) {
		return null;
	}
	return {
		readingMs: record.readingMs,
		openCount: record.openCount,
	};
}

function sanitizeStringMap<T>(
	value: unknown,
	sanitizeEntry: (entry: unknown) => T | null,
): Record<string, T> {
	const result: Record<string, T> = {};
	if (typeof value !== "object" || value === null) {
		return result;
	}
	for (const [key, entry] of Object.entries(value)) {
		const sanitized = sanitizeEntry(entry);
		if (sanitized !== null && key.length > 0) {
			result[key] = sanitized;
		}
	}
	return result;
}

/**
 * Bring arbitrary persisted data up to the current schema version and shape.
 * Throws ValidationError when the data cannot be handled (non-object input or
 * a newer schema version); malformed sub-records are dropped instead.
 */
export function migrate(input: unknown): PluginData {
	if (input === null || input === undefined) {
		return createDefaultData();
	}
	if (typeof input !== "object" || Array.isArray(input)) {
		throw new ValidationError("Stored data is not an object.");
	}

	let data = input as Record<string, unknown>;
	let version = isFiniteNumber(data.schemaVersion) ? data.schemaVersion : 0;
	if (version > CURRENT_SCHEMA_VERSION) {
		throw new ValidationError(
			`Stored data schema version ${version} is newer than the supported version ${CURRENT_SCHEMA_VERSION}.`,
		);
	}
	while (version < CURRENT_SCHEMA_VERSION) {
		const step = migrationSteps[version];
		if (!step) {
			throw new ValidationError(`No migration path from schema version ${version}.`);
		}
		data = step(data);
		version = isFiniteNumber(data.schemaVersion)
			? (data.schemaVersion as number)
			: version + 1;
	}

	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		settings: mergeSettings(data.settings),
		notes: sanitizeStringMap(data.notes, sanitizeNoteRecord),
		days: sanitizeStringMap(data.days, sanitizeDayRecord),
	};
}

export { CURRENT_SCHEMA_VERSION };
