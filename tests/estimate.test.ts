import { describe, expect, it } from "vitest";
import {
	countReadingUnits,
	estimateRemainingReadingMs,
	formatRemainingTime,
} from "../src/core/estimate";

describe("countReadingUnits", () => {
	it("counts every CJK character as one unit", () => {
		expect(countReadingUnits("数学分析")).toBe(4);
	});

	it("counts consecutive latin or digit runs as single words", () => {
		expect(countReadingUnits("hello world")).toBe(2);
		expect(countReadingUnits("Dirichlet 1829")).toBe(2);
	});

	it("mixes CJK characters and latin words", () => {
		// Taylor = 1 word, 展开 = 2 characters.
		expect(countReadingUnits("Taylor 展开")).toBe(1 + 2);
	});

	it("ignores whitespace and punctuation", () => {
		expect(countReadingUnits("  ，。！？；：/\\（）《》  ")).toBe(0);
	});

	it("returns 0 for empty text", () => {
		expect(countReadingUnits("")).toBe(0);
	});

	it("handles markdown syntax without counting it as words", () => {
		expect(countReadingUnits("## 标题")).toBe(2);
		expect(countReadingUnits("**bold** text")).toBe(2);
	});
});

describe("estimateRemainingReadingMs", () => {
	it("estimates by remaining units and speed", () => {
		// 700 units, 50 percent read, 350 units per minute -> 1 minute.
		expect(estimateRemainingReadingMs(700, 0.5, 350)).toBe(60_000);
	});

	it("returns the full time for unread notes", () => {
		expect(estimateRemainingReadingMs(350, 0, 350)).toBe(60_000);
	});

	it("returns zero when fully read", () => {
		expect(estimateRemainingReadingMs(350, 1, 350)).toBe(0);
	});

	it("clamps progress outside [0, 1]", () => {
		expect(estimateRemainingReadingMs(350, 1.4, 350)).toBe(0);
		expect(estimateRemainingReadingMs(350, -0.2, 350)).toBe(60_000);
	});

	it("treats non-positive speed as one unit per minute", () => {
		expect(estimateRemainingReadingMs(10, 0, 0)).toBe(600_000);
	});
});

describe("formatRemainingTime", () => {
	it("returns an empty string for unknown time", () => {
		expect(formatRemainingTime(null)).toBe("");
	});

	it("omits spans under one minute", () => {
		expect(formatRemainingTime(59_999)).toBe("");
		expect(formatRemainingTime(0)).toBe("");
	});

	it("uses whole minutes under an hour", () => {
		expect(formatRemainingTime(60_000)).toBe("1 分钟");
		expect(formatRemainingTime(8 * 60_000)).toBe("8 分钟");
	});

	it("uses hours with one decimal at and above one hour", () => {
		expect(formatRemainingTime(3_600_000)).toBe("1.0 小时");
		expect(formatRemainingTime(9 * 3_600_000)).toBe("9.0 小时");
	});
});
