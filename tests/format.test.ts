import { describe, expect, it } from "vitest";
import { formatDuration, formatStatusBar } from "../src/core/format";

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
