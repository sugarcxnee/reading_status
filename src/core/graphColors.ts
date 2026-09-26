/**
 * Reading-progress coloring for the global graph. Obsidian's graph has no
 * public coloring API, so this module generates color groups (search queries
 * of OR-combined path: terms) that the plugin writes into graph.json.
 *
 * Every generated query embeds a sentinel path (GRAPH_GROUP_MARKER) that can
 * never match a real note; it both marks the group as plugin-owned, so later
 * updates replace only their own groups, and keeps empty buckets harmless.
 * Unresolved link nodes are not files and therefore never match these
 * queries; they keep the appearance configured by the user or theme.
 */
export const GRAPH_GROUP_MARKER = "__reading-status-bucket-";

/** 0 unread, 1-4 progress quartiles, 5 fully read. */
export const PROGRESS_BUCKET_COUNT = 6;

const HUE = 210;
const SATURATION = 65;
const LIGHTEST_L = 78;
const DARKEST_L = 22;

/** Map a progress value in [0, 1] to its bucket index. */
export function progressBucket(progress: number): number {
	if (progress >= 1) {
		return PROGRESS_BUCKET_COUNT - 1;
	}
	if (progress <= 0) {
		return 0;
	}
	return Math.min(PROGRESS_BUCKET_COUNT - 2, Math.floor(progress * 4) + 1);
}

/**
 * Convert HSL to a packed RGB integer as used by graph color groups.
 * Hue in [0, 360), saturation and lightness in [0, 100].
 */
export function hslToRgbInt(h: number, s: number, l: number): number {
	const sat = s / 100;
	const light = l / 100;
	const c = (1 - Math.abs(2 * light - 1)) * sat;
	const hp = h / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	let r1 = 0;
	let g1 = 0;
	let b1 = 0;
	if (hp < 1) {
		[r1, g1, b1] = [c, x, 0];
	} else if (hp < 2) {
		[r1, g1, b1] = [x, c, 0];
	} else if (hp < 3) {
		[r1, g1, b1] = [0, c, x];
	} else if (hp < 4) {
		[r1, g1, b1] = [0, x, c];
	} else if (hp < 5) {
		[r1, g1, b1] = [x, 0, c];
	} else {
		[r1, g1, b1] = [c, 0, x];
	}
	const m = light - c / 2;
	const r = Math.round((r1 + m) * 255);
	const g = Math.round((g1 + m) * 255);
	const b = Math.round((b1 + m) * 255);
	return (r << 16) | (g << 8) | b;
}

export interface GraphColor {
	a: number;
	rgb: number;
}

export interface ColorGroup {
	query: string;
	color: GraphColor;
}

function bucketColor(bucket: number): GraphColor {
	const lightness =
		LIGHTEST_L -
		(bucket / (PROGRESS_BUCKET_COUNT - 1)) * (LIGHTEST_L - DARKEST_L);
	return { a: 1, rgb: hslToRgbInt(HUE, SATURATION, lightness) };
}

/**
 * Build the search query for one bucket. Paths containing double quotes
 * cannot be quoted safely and are skipped. Returns null when no path is
 * usable, in which case the bucket is omitted entirely.
 */
export function buildGroupQuery(
	bucket: number,
	paths: readonly string[],
): string | null {
	const usable = paths.filter((path) => path !== "" && !path.includes('"'));
	if (usable.length === 0) {
		return null;
	}
	const clauses = [
		`path:"${GRAPH_GROUP_MARKER}${bucket}__"`,
		...usable.map((path) => `path:"${path}"`),
	];
	return clauses.join(" OR ");
}

/**
 * Build one color group per non-empty progress bucket, ordered from unread
 * (lightest) to fully read (darkest). Untracked notes (null progress) count
 * as unread.
 */
export function buildReadingColorGroups(
	progressByPath: Record<string, number | null>,
): ColorGroup[] {
	const buckets: string[][] = Array.from(
		{ length: PROGRESS_BUCKET_COUNT },
		() => [],
	);
	for (const [path, progress] of Object.entries(progressByPath)) {
		const bucket = progress === null ? 0 : progressBucket(progress);
		buckets[bucket].push(path);
	}
	const groups: ColorGroup[] = [];
	for (let bucket = 0; bucket < PROGRESS_BUCKET_COUNT; bucket += 1) {
		const query = buildGroupQuery(bucket, buckets[bucket]);
		if (query !== null) {
			groups.push({ query, color: bucketColor(bucket) });
		}
	}
	return groups;
}

/**
 * Combine foreign groups (kept as-is) with freshly generated ones, dropping
 * the plugin's own stale groups from a previous run. Malformed entries in
 * the existing list are discarded.
 */
export function mergeColorGroups(
	existing: unknown,
	generated: ColorGroup[],
): ColorGroup[] {
	const kept: ColorGroup[] = [];
	if (Array.isArray(existing)) {
		for (const entry of existing) {
			if (typeof entry !== "object" || entry === null) {
				continue;
			}
			const record = entry as Record<string, unknown>;
			if (typeof record.query !== "string") {
				continue;
			}
			if (
				typeof record.color !== "object" ||
				record.color === null
			) {
				continue;
			}
			const color = record.color as Record<string, unknown>;
			if (typeof color.a !== "number" || typeof color.rgb !== "number") {
				continue;
			}
			if (record.query.includes(GRAPH_GROUP_MARKER)) {
				continue;
			}
			kept.push({ query: record.query, color: { a: color.a, rgb: color.rgb } });
		}
	}
	return [...kept, ...generated];
}
