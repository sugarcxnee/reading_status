import { describe, expect, it } from "vitest";
import {
	localDayKey,
	startOfNextLocalDay,
	startOfWeekLocal,
} from "../src/core/time";

describe("localDayKey", () => {
	it("formats a local timestamp as YYYY-MM-DD", () => {
		const ts = new Date(2026, 8, 26, 10, 30, 0).getTime();
		expect(localDayKey(ts)).toBe("2026-09-26");
	});

	it("pads month and day", () => {
		const ts = new Date(2026, 0, 5, 0, 0, 0).getTime();
		expect(localDayKey(ts)).toBe("2026-01-05");
	});

	it("maps the last millisecond of a day to that day", () => {
		const endOfDay = new Date(2026, 8, 26, 23, 59, 59, 999).getTime();
		expect(localDayKey(endOfDay)).toBe("2026-09-26");
	});
});

describe("startOfNextLocalDay", () => {
	it("returns local midnight of the next day", () => {
		const ts = new Date(2026, 8, 26, 15, 0, 0).getTime();
		const expected = new Date(2026, 8, 27, 0, 0, 0).getTime();
		expect(startOfNextLocalDay(ts)).toBe(expected);
	});

	it("returns the same value for any time within one day", () => {
		const morning = new Date(2026, 8, 26, 6, 0, 0).getTime();
		const evening = new Date(2026, 8, 26, 22, 0, 0).getTime();
		expect(startOfNextLocalDay(evening)).toBe(startOfNextLocalDay(morning));
	});
});

describe("startOfWeekLocal", () => {
	it("returns Monday midnight for a mid-week timestamp", () => {
		// 2026-09-26 is a Saturday; its ISO week starts on Monday 2026-09-21.
		const saturday = new Date(2026, 8, 26, 15, 0, 0).getTime();
		const expectedMonday = new Date(2026, 8, 21, 0, 0, 0).getTime();
		expect(startOfWeekLocal(saturday)).toBe(expectedMonday);
	});

	it("maps Sunday to the Monday six days earlier", () => {
		const sunday = new Date(2026, 8, 27, 12, 0, 0).getTime();
		const expectedMonday = new Date(2026, 8, 21, 0, 0, 0).getTime();
		expect(startOfWeekLocal(sunday)).toBe(expectedMonday);
	});

	it("returns midnight of the same day for a Monday timestamp", () => {
		const monday = new Date(2026, 8, 21, 9, 30, 0).getTime();
		const expected = new Date(2026, 8, 21, 0, 0, 0).getTime();
		expect(startOfWeekLocal(monday)).toBe(expected);
	});
});
