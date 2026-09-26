import { describe, expect, it } from "vitest";
import {
	GRAPH_GROUP_MARKER,
	PROGRESS_BUCKET_COUNT,
	buildGroupQuery,
	buildReadingColorGroups,
	hslToRgbInt,
	mergeColorGroups,
	progressBucket,
} from "../src/core/graphColors";

describe("progressBucket", () => {
	it("puts unread and untracked notes in bucket 0", () => {
		expect(progressBucket(0)).toBe(0);
	});

	it("splits partial progress into quartile buckets", () => {
		expect(progressBucket(0.01)).toBe(1);
		expect(progressBucket(0.25)).toBe(2);
		expect(progressBucket(0.3)).toBe(2);
		expect(progressBucket(0.5)).toBe(3);
		expect(progressBucket(0.75)).toBe(4);
		expect(progressBucket(0.99)).toBe(4);
	});

	it("puts fully read notes in the last bucket", () => {
		expect(progressBucket(1)).toBe(PROGRESS_BUCKET_COUNT - 1);
		expect(progressBucket(1.5)).toBe(PROGRESS_BUCKET_COUNT - 1);
	});
});

describe("hslToRgbInt", () => {
	it("converts primaries exactly", () => {
		expect(hslToRgbInt(0, 0, 100)).toBe(0xffffff); // white
		expect(hslToRgbInt(0, 0, 0)).toBe(0x000000); // black
		expect(hslToRgbInt(0, 100, 50)).toBe(0xff0000); // red
		expect(hslToRgbInt(120, 100, 50)).toBe(0x00ff00); // green
		expect(hslToRgbInt(240, 100, 50)).toBe(0x0000ff); // blue
	});

	it("stays within rgb bounds for the whole palette", () => {
		for (let bucket = 0; bucket < PROGRESS_BUCKET_COUNT; bucket += 1) {
			const groups = buildReadingColorGroups({ "a.md": bucket / (PROGRESS_BUCKET_COUNT - 1) });
			for (const group of groups) {
				expect(group.color.rgb).toBeLessThanOrEqual(0xffffff);
				expect(group.color.rgb).toBeGreaterThanOrEqual(0);
				expect(group.color.a).toBe(1);
			}
		}
	});

	it("darkens monotonically across buckets", () => {
		const groups = buildReadingColorGroups({
			"b0.md": 0,
			"b1.md": 0.1,
			"b2.md": 0.3,
			"b3.md": 0.6,
			"b4.md": 0.8,
			"b5.md": 1,
		});
		expect(groups).toHaveLength(PROGRESS_BUCKET_COUNT);
		const rgb = groups.map((g) => g.color.rgb);
		// Convert to per-channel darkness and require each channel to be
		// non-increasing as the bucket grows (darker blue).
		for (let i = 1; i < rgb.length; i += 1) {
			for (const shift of [16, 8, 0]) {
				const prev = (rgb[i - 1] >> shift) & 0xff;
				const curr = (rgb[i] >> shift) & 0xff;
				expect(curr).toBeLessThanOrEqual(prev);
			}
		}
	});
});

describe("buildGroupQuery", () => {
	it("combines paths with OR and embeds the marker", () => {
		const query = buildGroupQuery(2, ["a.md", "数学分析/总目录.md"]);
		expect(query).toBe(
			'path:"__reading-status-bucket-2__" OR path:"a.md" OR path:"数学分析/总目录.md"',
		);
	});

	it("returns null without usable paths", () => {
		expect(buildGroupQuery(0, [])).toBeNull();
	});

	it("skips paths containing double quotes", () => {
		const query = buildGroupQuery(1, ['bad"name.md', "ok.md"]);
		expect(query).toBe('path:"__reading-status-bucket-1__" OR path:"ok.md"');
	});
});

describe("buildReadingColorGroups", () => {
	it("buckets untracked notes as unread", () => {
		const groups = buildReadingColorGroups({
			"never-opened.md": null,
			"opened.md": 0,
		});
		expect(groups).toHaveLength(1);
		expect(groups[0].query).toContain("never-opened.md");
		expect(groups[0].query).toContain("opened.md");
	});

	it("omits empty buckets entirely", () => {
		const groups = buildReadingColorGroups({ "done.md": 1 });
		expect(groups).toHaveLength(1);
		expect(groups[0].query).toContain("done.md");
	});

	it("orders groups from unread to fully read", () => {
		const groups = buildReadingColorGroups({ a: 1, b: null });
		expect(groups[0].query).toContain("b");
		expect(groups[1].query).toContain("a");
	});
});

describe("mergeColorGroups", () => {
	it("replaces previous plugin groups and keeps foreign ones", () => {
		const foreign = { query: 'tag:"#book"', color: { a: 1, rgb: 16711680 } };
		const stale = {
			query: 'path:"__reading-status-bucket-0__" OR path:"old.md"',
			color: { a: 1, rgb: 1 },
		};
		const generated = buildReadingColorGroups({ "new.md": 1 });
		const merged = mergeColorGroups([foreign, stale], generated);
		expect(merged).toEqual([foreign, ...generated]);
	});

	it("handles a missing or malformed existing list", () => {
		const generated = buildReadingColorGroups({ "a.md": 0.5 });
		expect(mergeColorGroups(undefined, generated)).toEqual(generated);
		expect(mergeColorGroups("junk" as unknown, generated)).toEqual(generated);
	});

	it("drops foreign entries that are not well formed", () => {
		const generated = buildReadingColorGroups({ "a.md": 0 });
		const merged = mergeColorGroups(
			[{ query: 42 }, null, { query: 'tag:"#x"', color: { a: 1, rgb: 5 } }],
			generated,
		);
		expect(merged).toEqual([{ query: 'tag:"#x"', color: { a: 1, rgb: 5 } }, ...generated]);
	});
});

describe("marker", () => {
	it("is unlikely to collide with real file names", () => {
		expect(GRAPH_GROUP_MARKER).toContain("reading-status");
	});
});
