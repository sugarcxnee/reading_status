import { beforeEach, describe, expect, it } from "vitest";
import { ReadingEngine } from "../src/core/reading-engine";
import { createDefaultData } from "../src/core/defaults";
import { localDayKey } from "../src/core/time";
import type { PluginData, PluginSettings } from "../src/core/types";
import { FakeClock } from "./helpers/fake-clock";

// Local-time anchors so day-key assertions hold in any test timezone.
const T0 = new Date(2026, 8, 26, 10, 0, 0).getTime();
const DAY = localDayKey(T0);
const MIN = 60_000;

function setup(
	settings: Partial<PluginSettings> = {},
	startAt = T0,
): { data: PluginData; clock: FakeClock; engine: ReadingEngine } {
	const data = createDefaultData();
	Object.assign(data.settings, settings);
	const clock = new FakeClock(startAt);
	const engine = new ReadingEngine(data, clock);
	return { data, clock, engine };
}

describe("ReadingEngine open tracking", () => {
	it("creates a record and counts the first visit", () => {
		const { data, engine } = setup();
		engine.openNote("a.md");
		expect(data.notes["a.md"]).toEqual({
			openCount: 1,
			totalReadingMs: 0,
			firstReadAt: T0,
			lastReadAt: T0,
			maxProgress: 0,
			readSections: [],
		});
		expect(data.days[DAY]).toEqual({ readingMs: 0, openCount: 1 });
	});

	it("ignores repeated opens of the already active note", () => {
		const { data, engine } = setup();
		engine.openNote("a.md");
		engine.openNote("a.md");
		expect(data.notes["a.md"].openCount).toBe(1);
	});

	it("merges a reopen inside the dedupe window into one visit", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		engine.closeActiveNote();
		clock.advance(4 * MIN);
		engine.openNote("a.md");
		expect(data.notes["a.md"].openCount).toBe(1);
		expect(data.days[DAY].openCount).toBe(1);
	});

	it("counts a new visit once the dedupe window has passed", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		engine.closeActiveNote();
		clock.advance(6 * MIN);
		engine.openNote("a.md");
		expect(data.notes["a.md"].openCount).toBe(2);
		expect(data.days[DAY].openCount).toBe(2);
	});

	it("treats the dedupe window boundary as inclusive", () => {
		const { data, clock, engine } = setup(); // default window: 5 minutes
		engine.openNote("a.md");
		engine.closeActiveNote();
		clock.advance(5 * MIN);
		engine.openNote("a.md");
		expect(data.notes["a.md"].openCount).toBe(1);
	});

	it("keeps dedupe working across a plugin restart", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		engine.flush();
		const restarted = new ReadingEngine(data, clock);
		clock.advance(2 * MIN);
		restarted.openNote("a.md");
		expect(data.notes["a.md"].openCount).toBe(1);
	});
});

describe("ReadingEngine switching", () => {
	it("closes the previous session with accounted time when switching", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		clock.advance(2 * MIN);
		engine.openNote("b.md");
		expect(data.notes["a.md"].totalReadingMs).toBe(2 * MIN);
		expect(data.notes["b.md"].openCount).toBe(1);
		expect(engine.getActivePath()).toBe("b.md");
	});

	it("continues the visit when switching back inside the window", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		engine.openNote("b.md");
		engine.openNote("a.md");
		expect(data.notes["a.md"].openCount).toBe(1);
		expect(data.notes["b.md"].openCount).toBe(1);
	});

	it("closes and clears the active note on closeActiveNote", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		clock.advance(3 * MIN);
		engine.closeActiveNote();
		expect(engine.getActivePath()).toBeNull();
		expect(data.notes["a.md"].totalReadingMs).toBe(3 * MIN);
	});
});

describe("ReadingEngine exclusion", () => {
	it("does not track notes under an excluded path prefix", () => {
		const { data, engine } = setup({ excludedPaths: ["日记/"] });
		engine.openNote("日记/2026-09-26.md");
		expect(data.notes).toEqual({});
		expect(data.days).toEqual({});
	});

	it("closes the previous session when switching to an excluded note", () => {
		const { data, clock, engine } = setup({ excludedPaths: ["日记/"] });
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.openNote("日记/2026-09-26.md");
		expect(data.notes["a.md"].totalReadingMs).toBe(MIN);
		expect(data.notes["日记/2026-09-26.md"]).toBeUndefined();
		expect(engine.getActivePath()).toBeNull();
	});
});

describe("ReadingEngine time accounting", () => {
	it("books focused reading time on flush", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		clock.advance(90_000);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(90_000);
		expect(data.days[DAY].readingMs).toBe(90_000);
		expect(data.notes["a.md"].lastReadAt).toBe(T0 + 90_000);
	});

	it("counts a blur shorter than the idle threshold", () => {
		const { data, clock, engine } = setup(); // threshold: 60 s
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.blur();
		clock.advance(30_000);
		engine.focus();
		clock.advance(MIN);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(2 * MIN + 30_000);
	});

	it("does not count a blur longer than the idle threshold", () => {
		const { data, clock, engine } = setup(); // threshold: 60 s
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.blur();
		clock.advance(5 * MIN);
		engine.focus();
		clock.advance(MIN);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(2 * MIN);
	});

	it("treats the idle threshold boundary as inclusive", () => {
		const { data, clock, engine } = setup(); // threshold: 60 s
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.blur();
		clock.advance(60_000);
		engine.focus();
		clock.advance(MIN);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(3 * MIN);
	});

	it("ignores repeated blur or focus events", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.blur();
		clock.advance(30_000);
		engine.blur();
		engine.focus();
		engine.focus();
		clock.advance(MIN);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(2 * MIN + 30_000);
	});

	it("adds nothing while blurred", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.blur();
		clock.advance(10 * MIN);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(MIN);
	});

	it("survives blur and focus without an active note", () => {
		const { data, engine } = setup();
		engine.blur();
		clockAdvanceNoop();
		engine.focus();
		expect(data.notes).toEqual({});
		expect(data.days).toEqual({});
	});

	it("splits a session across midnight into both day keys", () => {
		const evening = new Date(2026, 8, 26, 23, 50, 0).getTime();
		const nextDay = localDayKey(
			new Date(2026, 8, 27, 0, 10, 0).getTime(),
		);
		const { data, clock, engine } = setup({}, evening);
		engine.openNote("a.md");
		clock.advance(20 * MIN);
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(20 * MIN);
		expect(data.days[localDayKey(evening)].readingMs).toBe(10 * MIN);
		expect(data.days[nextDay].readingMs).toBe(10 * MIN);
	});

	it("repeated flushes at the same time book no extra time", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		clock.advance(MIN);
		engine.flush();
		engine.flush();
		expect(data.notes["a.md"].totalReadingMs).toBe(MIN);
	});
});

describe("ReadingEngine rename handling", () => {
	it("moves an exact note record to the new path", () => {
		const { data, engine } = setup();
		engine.openNote("数学分析/a.md");
		engine.applyRename("数学分析/a.md", "数学分析/目录.md");
		expect(data.notes["数学分析/目录.md"]).toBeTruthy();
		expect(data.notes["数学分析/a.md"]).toBeUndefined();
	});

	it("moves every record under a renamed folder prefix", () => {
		const { data, engine } = setup();
		engine.openNote("数学分析/上册/a.md");
		engine.applyRename("数学分析/上册", "数学分析/第一册");
		expect(data.notes["数学分析/第一册/a.md"]).toBeTruthy();
		expect(data.notes["数学分析/上册/a.md"]).toBeUndefined();
	});

	it("keeps tracking the active session under the new path", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		engine.applyRename("a.md", "b.md");
		expect(engine.getActivePath()).toBe("b.md");
		clock.advance(2 * MIN);
		engine.flush();
		expect(data.notes["b.md"].totalReadingMs).toBe(2 * MIN);
		expect(data.notes["a.md"]).toBeUndefined();
	});

	it("keeps dedupe state across a rename", () => {
		const { data, clock, engine } = setup();
		engine.openNote("a.md");
		engine.closeActiveNote();
		engine.applyRename("a.md", "b.md");
		clock.advance(2 * MIN);
		engine.openNote("b.md");
		expect(data.notes["b.md"].openCount).toBe(1);
	});

	it("ignores renames that match nothing", () => {
		const { data, engine } = setup();
		engine.applyRename("ghost.md", "other.md");
		expect(data.notes).toEqual({});
	});
});

function clockAdvanceNoop(): void {
	// Placeholder to express "time passes without events" in a readable way.
}
