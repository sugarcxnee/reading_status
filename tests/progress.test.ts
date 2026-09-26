import { describe, expect, it } from "vitest";
import { computeScrollRatio, mergeMaxProgress } from "../src/core/progress";

describe("computeScrollRatio", () => {
	it("computes top over scrollable distance", () => {
		expect(computeScrollRatio(250, 1000, 500)).toBeCloseTo(0.5);
	});

	it("returns 1 when the content fits the viewport", () => {
		expect(computeScrollRatio(0, 500, 500)).toBe(1);
		expect(computeScrollRatio(0, 300, 500)).toBe(1);
	});

	it("clamps out-of-range inputs into [0, 1]", () => {
		expect(computeScrollRatio(-20, 1000, 500)).toBe(0);
		expect(computeScrollRatio(9999, 1000, 500)).toBe(1);
	});

	it("returns 1 when scrolled to the bottom", () => {
		expect(computeScrollRatio(500, 1000, 500)).toBe(1);
	});
});

describe("mergeMaxProgress", () => {
	it("keeps the larger value", () => {
		expect(mergeMaxProgress(0.4, 0.7)).toBe(0.7);
		expect(mergeMaxProgress(0.9, 0.2)).toBe(0.9);
	});

	it("clamps inputs into [0, 1]", () => {
		expect(mergeMaxProgress(0.5, 1.4)).toBe(1);
		expect(mergeMaxProgress(0.5, -0.2)).toBe(0.5);
	});
});
