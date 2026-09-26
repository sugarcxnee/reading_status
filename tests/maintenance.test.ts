import { describe, expect, it } from "vitest";
import {
	applyDataRetention,
	pruneDeletedNotes,
	resetNoteStats,
} from "../src/core/maintenance";
import { createDefaultData } from "../src/core/defaults";
import { localDayKey } from "../src/core/time";
import type { PluginData } from "../src/core/types";

const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime();

function dayKeyOf(year: number, month: number, day: number): string {
	return localDayKey(new Date(year, month - 1, day, 12).getTime());
}

describe("pruneDeletedNotes", () => {
	it("removes records whose files no longer exist", () => {
		const data = createDefaultData();
		data.notes = {
			"kept.md": data.notes["kept.md"] ?? emptyRecord(),
			"gone.md": emptyRecord(),
		};
		const removed = pruneDeletedNotes(data, new Set(["kept.md"]));
		expect(removed).toBe(1);
		expect(data.notes["gone.md"]).toBeUndefined();
		expect(data.notes["kept.md"]).toBeTruthy();
	});

	it("keeps everything when all files exist", () => {
		const data = createDefaultData();
		data.notes = { "a.md": emptyRecord(), "b.md": emptyRecord() };
		expect(pruneDeletedNotes(data, new Set(["a.md", "b.md"]))).toBe(0);
		expect(Object.keys(data.notes)).toHaveLength(2);
	});
});

describe("resetNoteStats", () => {
	it("deletes the record for the given path", () => {
		const data = createDefaultData();
		data.notes = { "a.md": emptyRecord() };
		expect(resetNoteStats(data, "a.md")).toBe(true);
		expect(data.notes).toEqual({});
	});

	it("reports false for unknown paths", () => {
		expect(resetNoteStats(createDefaultData(), "ghost.md")).toBe(false);
	});
});

describe("applyDataRetention", () => {
	it("removes day records older than the retention window", () => {
		const data = createDefaultData();
		data.settings.dataRetentionDays = 7;
		data.days = {
			[dayKeyOf(2026, 9, 18)]: { readingMs: 1, openCount: 1 },
			[dayKeyOf(2026, 9, 19)]: { readingMs: 2, openCount: 1 },
			[dayKeyOf(2026, 9, 26)]: { readingMs: 3, openCount: 1 },
		};
		const changed = applyDataRetention(data, NOW);
		expect(changed).toBe(true);
		expect(data.days[dayKeyOf(2026, 9, 18)]).toBeUndefined();
		expect(data.days[dayKeyOf(2026, 9, 19)]).toBeTruthy();
		expect(data.days[dayKeyOf(2026, 9, 26)]).toBeTruthy();
	});

	it("keeps the boundary day itself", () => {
		const data = createDefaultData();
		data.settings.dataRetentionDays = 7;
		data.days = { [dayKeyOf(2026, 9, 19)]: { readingMs: 1, openCount: 1 } };
		applyDataRetention(data, NOW);
		expect(data.days[dayKeyOf(2026, 9, 19)]).toBeTruthy();
	});

	it("does nothing when retention is disabled", () => {
		const data = createDefaultData();
		data.days = { [dayKeyOf(2020, 1, 1)]: { readingMs: 1, openCount: 1 } };
		expect(applyDataRetention(data, NOW)).toBe(false);
		expect(Object.keys(data.days)).toHaveLength(1);
	});
});

function emptyRecord() {
	return {
		openCount: 0,
		totalReadingMs: 0,
		firstReadAt: 0,
		lastReadAt: 0,
		maxProgress: 0,
		readSections: [] as string[],
	};
}
