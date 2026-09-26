import { computeChapterStats } from "./chapters";
import type { Section } from "./chapters";
import { localDayKey } from "./time";

/** Reading duration in a human-friendly compact form. */
export function formatDuration(ms: number): string {
	if (ms < 3_600_000) {
		return `${Math.floor(ms / 60_000)} 分钟`;
	}
	return `${(ms / 3_600_000).toFixed(1)} 小时`;
}

export interface StatusBarModel {
	openCount: number;
	totalReadingMs: number;
	/** Reading progress in [0, 1]. */
	progress: number;
	/** Remaining chapter count, or null when the note has no chapters. */
	remainingChapters: number | null;
}

/** Status bar line for the active note. */
export function formatStatusBar(model: StatusBarModel): string {
	const percent = Math.round(Math.min(1, Math.max(0, model.progress)) * 100);
	const parts = [
		`阅读 ${model.openCount} 次`,
		formatDuration(model.totalReadingMs),
		`${percent}%`,
	];
	if (model.remainingChapters !== null) {
		parts.push(`剩 ${model.remainingChapters} 章`);
	}
	return parts.join(" · ");
}

/**
 * Build the status bar model from a stored record and the sections parsed
 * from the current document. Notes without chapters omit the chapter count.
 */
export function buildStatusBarModel(
	record: {
		openCount: number;
		totalReadingMs: number;
		maxProgress: number;
		readSections: string[];
	},
	sections: Section[],
): StatusBarModel {
	const stats = computeChapterStats(sections, record.readSections);
	return {
		openCount: record.openCount,
		totalReadingMs: record.totalReadingMs,
		progress: record.maxProgress,
		remainingChapters: stats.total > 0 ? stats.remaining : null,
	};
}

/** Compact relative time for "last read" displays. */
export function formatRelativeTime(timestamp: number, now: number): string {
	const elapsed = now - timestamp;
	if (elapsed < 60_000) {
		return "刚刚";
	}
	if (elapsed < 3_600_000) {
		return `${Math.floor(elapsed / 60_000)} 分钟前`;
	}
	if (elapsed < 86_400_000) {
		return `${Math.floor(elapsed / 3_600_000)} 小时前`;
	}
	if (elapsed < 7 * 86_400_000) {
		return `${Math.floor(elapsed / 86_400_000)} 天前`;
	}
	return localDayKey(timestamp);
}
