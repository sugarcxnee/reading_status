/**
 * Scroll progress ratio in [0, 1]. Content that fits the viewport counts as
 * fully read, and out-of-range scroll positions are clamped.
 */
export function computeScrollRatio(
	top: number,
	height: number,
	clientHeight: number,
): number {
	const scrollable = height - clientHeight;
	if (scrollable <= 0) {
		return 1;
	}
	const ratio = top / scrollable;
	return Math.min(1, Math.max(0, ratio));
}

/** Keep the highest progress ever observed, clamped to [0, 1]. */
export function mergeMaxProgress(
	previous: number,
	current: number,
): number {
	const clamped = Math.min(1, Math.max(0, current));
	return Math.max(previous, clamped);
}
