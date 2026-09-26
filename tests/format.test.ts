import { describe, expect, it } from "vitest";
import {
	formatDuration,
	formatRelativeTime,
	formatStatusBar,
} from "../src/core/format";

describe("formatDuration", () => {
	it("formats minutes below one hour", () => {
		expect(formatDuration(0)).toBe("0 分钟");
		expect(formatDuration(45_000)).toBe("0 分钟");
		expect(formatDuration(12 * 60_000)).toBe("12 分钟");
		expect(formatDuration(59 * 60_000 + 59_000)).toBe("59 分钟");
	});

	it("formats hours with one decimal at and above one hour", () => {
		expect(formatDuration(3_600_000)).toBe("1.0 小时");
		expect(formatDuration(90 * 60_000)).toBe("1.5 小时");
		expect(formatDuration(270 * 60_000)).toBe("4.5 小时");
	});
});

describe("formatStatusBar", () => {
	it("renders visits, duration, progress and remaining chapters", () => {
		expect(
			formatStatusBar({
				openCount: 3,
				totalReadingMs: 12 * 60_000,
				progress: 0.456,
				remainingChapters: 7,
			}),
		).toBe("阅读 3 次 · 12 分钟 · 46% · 剩 7 章");
	});

	it("omits the chapter segment when there are no chapters", () => {
		expect(
			formatStatusBar({
				openCount: 1,
				totalReadingMs: 0,
				progress: 0,
				remainingChapters: null,
			}),
		).toBe("阅读 1 次 · 0 分钟 · 0%");
	});

	it("rounds progress to whole percent", () => {
		expect(
			formatStatusBar({
				openCount: 2,
				totalReadingMs: 0,
				progress: 0.995,
				remainingChapters: 0,
			}),
		).toBe("阅读 2 次 · 0 分钟 · 100% · 剩 0 章");
	});
});

describe("formatRelativeTime", () => {
	const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime();
	const MIN = 60_000;
	const HOUR = 3_600_000;

	it("says just now for spans under one minute", () => {
		expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("刚刚");
	});

	it("uses minutes under one hour", () => {
		expect(formatRelativeTime(NOW - 5 * MIN, NOW)).toBe("5 分钟前");
		expect(formatRelativeTime(NOW - 59 * MIN, NOW)).toBe("59 分钟前");
	});

	it("uses hours under one day", () => {
		expect(formatRelativeTime(NOW - 3 * HOUR, NOW)).toBe("3 小时前");
		expect(formatRelativeTime(NOW - 23 * HOUR, NOW)).toBe("23 小时前");
	});

	it("uses days under one week", () => {
		expect(formatRelativeTime(NOW - 3 * 24 * HOUR, NOW)).toBe("3 天前");
		expect(formatRelativeTime(NOW - 6 * 24 * HOUR, NOW)).toBe("6 天前");
	});

	it("falls back to a local date beyond one week", () => {
		expect(formatRelativeTime(new Date(2026, 8, 18, 12, 0, 0).getTime(), NOW)).toBe("2026-09-18");
	});

	it("reports future timestamps as just now", () => {
		expect(formatRelativeTime(NOW + MIN, NOW)).toBe("刚刚");
	});
});
