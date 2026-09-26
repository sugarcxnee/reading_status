import { describe, expect, it } from "vitest";
import { parseImport, serializeExport } from "../src/core/io";
import { ValidationError } from "../src/core/migrate";
import { createDefaultData } from "../src/core/defaults";
import type { PluginData } from "../src/core/types";

function seededData(): PluginData {
	const data = createDefaultData();
	data.settings.chapterLevel = 3;
	data.notes["数学分析/总目录.md"] = {
		openCount: 4,
		totalReadingMs: 250_000,
		firstReadAt: 1,
		lastReadAt: 2,
		maxProgress: 0.6,
		readSections: ["第一章"],
	};
	data.days["2026-09-26"] = { readingMs: 250_000, openCount: 4 };
	return data;
}

describe("serializeExport / parseImport", () => {
	it("round-trips data losslessly", () => {
		const original = seededData();
		const restored = parseImport(serializeExport(original));
		expect(restored).toEqual(original);
	});

	it("rejects text that is not valid JSON", () => {
		expect(() => parseImport("{ not json")).toThrow(ValidationError);
	});

	it("rejects data from a newer schema version", () => {
		const json = JSON.stringify({ schemaVersion: 99, notes: {}, days: {} });
		expect(() => parseImport(json)).toThrow(ValidationError);
	});

	it("migrates legacy data without a schema version", () => {
		const legacy = JSON.stringify({
			notes: {
				"a.md": {
					openCount: 2,
					totalReadingMs: 5_000,
					firstReadAt: 1,
					lastReadAt: 2,
					maxProgress: 0.3,
				},
			},
		});
		const imported = parseImport(legacy);
		expect(imported.schemaVersion).toBe(1);
		expect(imported.notes["a.md"].readSections).toEqual([]);
		expect(imported.settings.chapterLevel).toBe(2);
	});

	it("keeps unicode note paths intact", () => {
		const original = seededData();
		const restored = parseImport(serializeExport(original));
		expect(Object.keys(restored.notes)).toEqual(["数学分析/总目录.md"]);
	});
});
