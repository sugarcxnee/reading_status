/**
 * Rough reading-time estimation. Reading units count every CJK character and
 * every run of latin letters or digits as one unit; markdown punctuation and
 * whitespace are ignored. The estimate divides remaining units by a
 * configurable reading speed.
 */
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const WORD_CHAR = /[A-Za-z0-9]/;

/** Count reading units in a note body. */
export function countReadingUnits(text: string): number {
	let units = 0;
	let inWord = false;
	for (const ch of text) {
		if (CJK_PATTERN.test(ch)) {
			units += 1;
			inWord = false;
			continue;
		}
		if (WORD_CHAR.test(ch)) {
			if (!inWord) {
				units += 1;
				inWord = true;
			}
			continue;
		}
		inWord = false;
	}
	return units;
}

/**
 * Estimated time in ms to finish a note given its total units, the highest
 * progress ever reached and a reading speed in units per minute. Progress is
 * clamped to [0, 1]; speeds below one are treated as one unit per minute.
 */
export function estimateRemainingReadingMs(
	totalUnits: number,
	progress: number,
	unitsPerMinute: number,
): number {
	const speed = Math.max(1, unitsPerMinute);
	const clampedProgress = Math.min(1, Math.max(0, progress));
	const remainingUnits = totalUnits * (1 - clampedProgress);
	return (remainingUnits / speed) * 60_000;
}

/**
 * Compact remaining-time label. Unknown input and spans under one minute
 * return an empty string so callers can omit the segment entirely.
 */
export function formatRemainingTime(ms: number | null): string {
	if (ms === null) {
		return "";
	}
	if (ms < 60_000) {
		return "";
	}
	if (ms < 3_600_000) {
		return `${Math.round(ms / 60_000)} 分钟`;
	}
	return `${(ms / 3_600_000).toFixed(1)} 小时`;
}
