import { describe, expect, it } from "vitest";
import {
	computeChapterStats,
	normalizeSectionId,
	parseHeadings,
	updateReadSections,
} from "../src/core/chapters";

const DOC = `# Title

Intro paragraph.

## Chapter One

Text.

### Subsection

## Chapter Two

More text.

## Chapter Three

End.
`;

const FENCED_DOC = `## Real Chapter

\`\`\`
## Not A Chapter
\`\`\`

~~~
## Also Not A Chapter
~~~

## Real Chapter Two
`;

describe("parseHeadings", () => {
	it("extracts only headings at the configured level", () => {
		const sections = parseHeadings(DOC, 2);
		expect(sections.map((s) => s.title)).toEqual([
			"Chapter One",
			"Chapter Two",
			"Chapter Three",
		]);
	});

	it("extracts level one headings when configured", () => {
		const sections = parseHeadings(DOC, 1);
		expect(sections.map((s) => s.title)).toEqual(["Title"]);
	});

	it("extracts deeper headings when configured", () => {
		const sections = parseHeadings(DOC, 3);
		expect(sections.map((s) => s.title)).toEqual(["Subsection"]);
	});

	it("skips headings inside code fences", () => {
		const sections = parseHeadings(FENCED_DOC, 2);
		expect(sections.map((s) => s.title)).toEqual([
			"Real Chapter",
			"Real Chapter Two",
		]);
	});

	it("assigns position ratios based on line offset", () => {
		const lines = DOC.split("\n");
		const sections = parseHeadings(DOC, 2);
		const chapterOne = sections[0];
		const chapterTwo = sections[1];
		expect(chapterOne.positionRatio).toBeCloseTo(4 / (lines.length - 1));
		expect(chapterTwo.positionRatio).toBeGreaterThan(chapterOne.positionRatio);
	});

	it("collapses whitespace in ids but keeps the title intact", () => {
		const sections = parseHeadings("##   Dirichlet   收敛定理  \n", 2);
		expect(sections[0].title).toBe("Dirichlet   收敛定理");
		expect(sections[0].id).toBe("Dirichlet 收敛定理");
	});

	it("returns an empty list for a document without matching headings", () => {
		expect(parseHeadings("Just text.\n\nMore text.\n", 2)).toEqual([]);
	});

	it("ignores hashes that do not form a heading", () => {
		const doc = "## Good\n\n#! Not heading\n##\n#### Too deep\n";
		const sections = parseHeadings(doc, 2);
		expect(sections.map((s) => s.title)).toEqual(["Good"]);
	});
});

describe("normalizeSectionId", () => {
	it("trims and collapses internal whitespace", () => {
		expect(normalizeSectionId("  a   b  ")).toBe("a b");
	});
});

describe("updateReadSections", () => {
	it("marks sections at or above the scroll ratio as read", () => {
		const sections = parseHeadings(DOC, 2);
		const updated = updateReadSections(sections, sections[1].positionRatio, []);
		expect(updated).toEqual([sections[0].id, sections[1].id]);
	});

	it("keeps previously read sections even beyond the scroll ratio", () => {
		const sections = parseHeadings(DOC, 2);
		const stored = [sections[2].id];
		const updated = updateReadSections(
			sections,
			sections[0].positionRatio,
			stored,
		);
		expect(updated).toEqual([sections[2].id, sections[0].id]);
	});

	it("does not duplicate ids", () => {
		const sections = parseHeadings(DOC, 2);
		const once = updateReadSections(sections, 0.5, []);
		const twice = updateReadSections(sections, 0.5, once);
		expect(new Set(twice).size).toBe(twice.length);
	});
});

describe("computeChapterStats", () => {
	it("counts read and remaining chapters from current sections", () => {
		const sections = parseHeadings(DOC, 2);
		const stats = computeChapterStats(sections, [sections[0].id]);
		expect(stats).toEqual({ total: 3, read: 1, remaining: 2 });
	});

	it("ignores stored ids that no longer exist in the document", () => {
		const sections = parseHeadings(DOC, 2);
		const stats = computeChapterStats(sections, [
			sections[0].id,
			"Renamed Away",
		]);
		expect(stats).toEqual({ total: 3, read: 1, remaining: 2 });
	});

	it("reports zero remaining for a document without chapters", () => {
		expect(computeChapterStats([], ["Old"])).toEqual({
			total: 0,
			read: 0,
			remaining: 0,
		});
	});
});
