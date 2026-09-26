import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrate, ValidationError } from "../src/core/migrate";
import type { PluginData } from "../src/core/types";

describe("migrate", () => {
	it("returns current data unchanged", () => {
		const data: PluginData = {
			schemaVersion: 1,
			settings: {
				chapterLevel: 2,
				dedupeWindowMs: 300_000,
				idleThresholdMs: 60_000,
				showStatusBar: true,
				excludedPaths: [],
				dataRetentionDays: 0,
				graphColorEnabled: true,
				readingUnitsPerMinute: 350,
			},
			notes: {},
			days: {},
		};
		expect(migrate(data)).toEqual(data);
	});

	it("upgrades version-less v0 data to schema version 1", () => {
		const v0 = {
			notes: {
				"a.md": {
					openCount: 2,
					totalReadingMs: 5_000,
					firstReadAt: 1,
					lastReadAt: 2,
					maxProgress: 0.3,
				},
			},
		};
		const migrated = migrate(v0);
		expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		expect(migrated.notes["a.md"]).toEqual({
			openCount: 2,
			totalReadingMs: 5_000,
			firstReadAt: 1,
			lastReadAt: 2,
			maxProgress: 0.3,
			readSections: [],
		});
		expect(migrated.days).toEqual({});
	});

	it("treats null or undefined as fresh data", () => {
		expect(migrate(null)).toEqual({
			schemaVersion: CURRENT_SCHEMA_VERSION,
			settings: expect.objectContaining({ chapterLevel: 2 }),
			notes: {},
			days: {},
		});
	});

	it("throws ValidationError for future schema versions", () => {
		expect(() =>
			migrate({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 }),
		).toThrow(ValidationError);
	});

	it("throws ValidationError for non-object input", () => {
		expect(() => migrate("not an object")).toThrow(ValidationError);
		expect(() => migrate(42)).toThrow(ValidationError);
	});

	it("sanitizes malformed note records instead of throwing", () => {
		const migrated = migrate({
			schemaVersion: 1,
			notes: {
				"good.md": {
					openCount: 1,
					totalReadingMs: 100,
					firstReadAt: 1,
					lastReadAt: 2,
					maxProgress: 0.2,
					readSections: ["#one"],
				},
				"bad.md": { openCount: "many", totalReadingMs: "long" },
			},
			days: {
				"2026-09-26": { readingMs: 100, openCount: 1 },
				"bad-day": { readingMs: "x" },
			},
		});
		expect(migrated.notes["good.md"]).toBeTruthy();
		expect(migrated.notes["bad.md"]).toBeUndefined();
		expect(migrated.days["2026-09-26"]).toEqual({ readingMs: 100, openCount: 1 });
		expect(migrated.days["bad-day"]).toBeUndefined();
	});
});
