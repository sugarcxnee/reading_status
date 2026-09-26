import { describe, expect, it } from "vitest";
import {
	createDefaultData,
	createDefaultSettings,
	mergeSettings,
} from "../src/core/defaults";
import type { PluginData, PluginSettings } from "../src/core/types";

describe("createDefaultSettings", () => {
	it("returns expected defaults", () => {
		const settings = createDefaultSettings();
		expect(settings).toEqual({
			chapterLevel: 2,
			dedupeWindowMs: 300_000,
			idleThresholdMs: 60_000,
			showStatusBar: true,
			excludedPaths: [] as string[],
			dataRetentionDays: 0,
		});
	});
});

describe("createDefaultData", () => {
	it("returns empty data with schema version 1 and default settings", () => {
		const data = createDefaultData();
		expect(data).toEqual({
			schemaVersion: 1,
			settings: createDefaultSettings(),
			notes: {},
			days: {},
		});
	});
});

describe("mergeSettings", () => {
	it("keeps stored values and fills in missing keys with defaults", () => {
		const stored: Partial<PluginSettings> = {
			chapterLevel: 3,
			excludedPaths: ["日记/"],
		};
		const merged = mergeSettings(stored);
		expect(merged.chapterLevel).toBe(3);
		expect(merged.excludedPaths).toEqual(["日记/"]);
		expect(merged.dedupeWindowMs).toBe(300_000);
		expect(merged.idleThresholdMs).toBe(60_000);
		expect(merged.showStatusBar).toBe(true);
		expect(merged.dataRetentionDays).toBe(0);
	});

	it("drops values with the wrong type and uses the default instead", () => {
		const stored: Record<string, unknown> = {
			chapterLevel: "two",
			dedupeWindowMs: -5,
			idleThresholdMs: null,
			showStatusBar: "yes",
			excludedPaths: "日记",
			dataRetentionDays: true,
		};
		const merged = mergeSettings(stored);
		expect(merged).toEqual(createDefaultSettings());
	});
});

describe("PluginData shape", () => {
	it("accepts a well-formed record", () => {
		const data: PluginData = {
			...createDefaultData(),
			notes: {
				"数学分析/总目录.md": {
					openCount: 3,
					totalReadingMs: 120_000,
					firstReadAt: 1_700_000_000_000,
					lastReadAt: 1_700_000_100_000,
					maxProgress: 0.5,
					readSections: ["#总目录"],
				},
			},
			days: {
				"2026-09-26": { readingMs: 120_000, openCount: 3 },
			},
		};
		expect(data.notes["数学分析/总目录.md"].openCount).toBe(3);
	});
});
