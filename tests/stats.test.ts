import { describe, expect, it } from "vitest";
import {
	getGlobalStats,
	getNoteSummary,
	listNoteSummaries,
	sortByLastRead,
	sortByMetric,
	type NoteSummary,
} from "../src/core/stats";
import { createDefaultData } from "../src/core/defaults";
import { localDayKey } from "../src/core/time";
import type { PluginData, NoteReadingRecord } from "../src/core/types";

// 2026-09-26 is a Saturday; the ISO week runs from Monday 2026-09-21.
const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime();
const HOUR = 3_600_000;

function note(overrides: Partial<NoteReadingRecord>): NoteReadingRecord {
	return {
		openCount: 1,
		totalReadingMs: 0,
		firstReadAt: 0,
		lastReadAt: 0,
		maxProgress: 0,
		readSections: [],
		...overrides,
	};
}

function dayKeyOf(year: number, month: number, day: number): string {
	return localDayKey(new Date(year, month - 1, day, 12, 0, 0).getTime());
}

function buildData(): PluginData {
	const data = createDefaultData();
	data.notes = {
		"数学分析/总目录.md": note({
			openCount: 5,
			totalReadingMs: 10 * HOUR,
			firstReadAt: 100,
			lastReadAt: 300,
			maxProgress: 0.8,
		}),
		"概率统计/讲义.md": note({
			openCount: 3,
			totalReadingMs: 20 * HOUR,
			firstReadAt: 200,
			lastReadAt: 500,
		}),
		"日记/2026-09-26.md": note({
			openCount: 9,
			totalReadingMs: 1 * HOUR,
			lastReadAt: 400,
		}),
	};
	data.days = {
		[dayKeyOf(2026, 9, 20)]: { readingMs: 3 * HOUR, openCount: 3 },
		[dayKeyOf(2026, 9, 21)]: { readingMs: 1 * HOUR, openCount: 1 },
		[dayKeyOf(2026, 9, 25)]: { readingMs: 2 * HOUR, openCount: 4 },
		[dayKeyOf(2026, 9, 26)]: { readingMs: 4 * HOUR, openCount: 2 },
	};
	return data;
}

describe("getNoteSummary", () => {
	it("returns the stored record with its path", () => {
		const data = buildData();
		const summary = getNoteSummary(data, "概率统计/讲义.md");
		expect(summary).toEqual({
			path: "概率统计/讲义.md",
			openCount: 3,
			totalReadingMs: 20 * HOUR,
			firstReadAt: 200,
			lastReadAt: 500,
			maxProgress: 0,
		});
	});

	it("returns null for an unknown path", () => {
		expect(getNoteSummary(buildData(), "missing.md")).toBeNull();
	});
});

describe("getGlobalStats", () => {
	it("aggregates today, this week and totals", () => {
		const stats = getGlobalStats(buildData(), NOW);
		expect(stats).toEqual({
			trackedNoteCount: 3,
			todayReadingMs: 4 * HOUR,
			todayOpenCount: 2,
			weekReadingMs: 7 * HOUR,
			weekOpenCount: 7,
			totalReadingMs: 31 * HOUR,
		});
	});

	it("reports zeros when no day has been recorded", () => {
		const stats = getGlobalStats(createDefaultData(), NOW);
		expect(stats.todayReadingMs).toBe(0);
		expect(stats.weekReadingMs).toBe(0);
		expect(stats.totalReadingMs).toBe(0);
		expect(stats.trackedNoteCount).toBe(0);
	});
});

describe("listNoteSummaries with filters", () => {
	it("returns all notes without a filter", () => {
		const summaries = listNoteSummaries(buildData());
		expect(summaries).toHaveLength(3);
	});

	it("filters by folder prefix", () => {
		const summaries = listNoteSummaries(buildData(), { folder: "数学分析" });
		expect(summaries.map((s) => s.path)).toEqual(["数学分析/总目录.md"]);
	});

	it("folder filter requires a full path segment match", () => {
		const data = createDefaultData();
		data.notes = {
			"数学分析/a.md": note({}),
			"数学分析基础/b.md": note({}),
		};
		const summaries = listNoteSummaries(data, { folder: "数学分析" });
		expect(summaries.map((s) => s.path)).toEqual(["数学分析/a.md"]);
	});

	it("filters by tag", () => {
		const data = buildData();
		const tags = {
			"数学分析/总目录.md": ["book", "math"],
			"概率统计/讲义.md": ["math"],
		};
		const summaries = listNoteSummaries(data, { tag: "book" }, tags);
		expect(summaries.map((s) => s.path)).toEqual(["数学分析/总目录.md"]);
	});

	it("combines folder and tag filters", () => {
		const data = buildData();
		const tags = {
			"数学分析/总目录.md": ["book"],
			"概率统计/讲义.md": ["book"],
		};
		const summaries = listNoteSummaries(
			data,
			{ folder: "概率统计", tag: "book" },
			tags,
		);
		expect(summaries.map((s) => s.path)).toEqual(["概率统计/讲义.md"]);
	});

	it("matches no notes when filtering by tag without a tag index", () => {
		const summaries = listNoteSummaries(buildData(), { tag: "book" });
		expect(summaries).toEqual([]);
	});
});

describe("sorting", () => {
	it("sorts by total reading time descending", () => {
		const summaries: NoteSummary[] = [
			{ path: "a", openCount: 1, totalReadingMs: 5, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
			{ path: "b", openCount: 9, totalReadingMs: 50, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
			{ path: "c", openCount: 2, totalReadingMs: 500, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
		];
		const sorted = sortByMetric(summaries, "totalReadingMs");
		expect(sorted.map((s) => s.path)).toEqual(["c", "b", "a"]);
	});

	it("sorts by open count descending", () => {
		const summaries: NoteSummary[] = [
			{ path: "a", openCount: 1, totalReadingMs: 0, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
			{ path: "b", openCount: 9, totalReadingMs: 0, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
		];
		const sorted = sortByMetric(summaries, "openCount");
		expect(sorted.map((s) => s.path)).toEqual(["b", "a"]);
	});

	it("breaks ties by path for stable ordering", () => {
		const summaries: NoteSummary[] = [
			{ path: "z", openCount: 1, totalReadingMs: 5, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
			{ path: "a", openCount: 1, totalReadingMs: 5, firstReadAt: 0, lastReadAt: 0, maxProgress: 0 },
		];
		const sorted = sortByMetric(summaries, "totalReadingMs");
		expect(sorted.map((s) => s.path)).toEqual(["a", "z"]);
	});

	it("sorts recently read notes first", () => {
		const summaries: NoteSummary[] = [
			{ path: "old", openCount: 1, totalReadingMs: 0, firstReadAt: 0, lastReadAt: 100, maxProgress: 0 },
			{ path: "new", openCount: 1, totalReadingMs: 0, firstReadAt: 0, lastReadAt: 900, maxProgress: 0 },
		];
		const sorted = sortByLastRead(summaries);
		expect(sorted.map((s) => s.path)).toEqual(["new", "old"]);
	});

	it("breaks ties by path for stable recency ordering", () => {
		const summaries: NoteSummary[] = [
			{ path: "z", openCount: 1, totalReadingMs: 0, firstReadAt: 0, lastReadAt: 500, maxProgress: 0 },
			{ path: "a", openCount: 1, totalReadingMs: 0, firstReadAt: 0, lastReadAt: 500, maxProgress: 0 },
		];
		const sorted = sortByLastRead(summaries);
		expect(sorted.map((s) => s.path)).toEqual(["a", "z"]);
	});
});
