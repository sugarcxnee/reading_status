import { localDayKey, startOfWeekLocal } from "./time";
import type { PluginData } from "./types";

export interface NoteSummary {
	path: string;
	openCount: number;
	totalReadingMs: number;
	firstReadAt: number;
	lastReadAt: number;
	maxProgress: number;
}

export interface GlobalStats {
	trackedNoteCount: number;
	todayReadingMs: number;
	todayOpenCount: number;
	weekReadingMs: number;
	weekOpenCount: number;
	totalReadingMs: number;
}

export interface NoteFilter {
	/** Folder path; matched as a full path segment prefix. */
	folder?: string;
	/** Tag without the leading hash; matched against the provided tag map. */
	tag?: string;
}

/** Tags for a set of notes, supplied by the Obsidian glue layer. */
export type TagIndex = Record<string, string[]>;

export function getNoteSummary(data: PluginData, path: string): NoteSummary | null {
	const record = data.notes[path];
	if (record === undefined) {
		return null;
	}
	return {
		path,
		openCount: record.openCount,
		totalReadingMs: record.totalReadingMs,
		firstReadAt: record.firstReadAt,
		lastReadAt: record.lastReadAt,
		maxProgress: record.maxProgress,
	};
}

function normalizeFolder(folder: string): string {
	const trimmed = folder.trim();
	if (trimmed.length === 0) {
		return "";
	}
	return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function matchesFolder(path: string, folder: string): boolean {
	const prefix = normalizeFolder(folder);
	return prefix.length === 0 || path.startsWith(prefix);
}

function matchesTag(path: string, tag: string, tags: TagIndex): boolean {
	const noteTags = tags[path];
	return noteTags !== undefined && noteTags.includes(tag);
}

/** All tracked notes, optionally restricted by folder and tag. */
export function listNoteSummaries(
	data: PluginData,
	filter?: NoteFilter,
	tags?: TagIndex,
): NoteSummary[] {
	const summaries: NoteSummary[] = [];
	for (const [path, record] of Object.entries(data.notes)) {
		if (filter?.folder !== undefined && !matchesFolder(path, filter.folder)) {
			continue;
		}
		if (filter?.tag !== undefined && !matchesTag(path, filter.tag, tags ?? {})) {
			continue;
		}
		summaries.push({
			path,
			openCount: record.openCount,
			totalReadingMs: record.totalReadingMs,
			firstReadAt: record.firstReadAt,
			lastReadAt: record.lastReadAt,
			maxProgress: record.maxProgress,
		});
	}
	return summaries;
}

export function getGlobalStats(data: PluginData, now: number): GlobalStats {
	const today = data.days[localDayKey(now)] ?? { readingMs: 0, openCount: 0 };

	let weekReadingMs = 0;
	let weekOpenCount = 0;
	// Calendar-aware iteration: adding fixed 24h spans would drift across
	// daylight-saving transitions.
	const weekStartDate = new Date(startOfWeekLocal(now));
	for (let offset = 0; offset < 7; offset += 1) {
		const day = new Date(weekStartDate);
		day.setDate(weekStartDate.getDate() + offset);
		const record = data.days[localDayKey(day.getTime())];
		if (record !== undefined) {
			weekReadingMs += record.readingMs;
			weekOpenCount += record.openCount;
		}
	}

	let totalReadingMs = 0;
	for (const record of Object.values(data.notes)) {
		totalReadingMs += record.totalReadingMs;
	}

	return {
		trackedNoteCount: Object.keys(data.notes).length,
		todayReadingMs: today.readingMs,
		todayOpenCount: today.openCount,
		weekReadingMs,
		weekOpenCount,
		totalReadingMs,
	};
}

type Metric = "totalReadingMs" | "openCount";

/** Rank notes by a metric, descending, with a stable path tiebreak. */
export function sortByMetric(summaries: NoteSummary[], metric: Metric): NoteSummary[] {
	return [...summaries].sort((a, b) => {
		if (b[metric] !== a[metric]) {
			return b[metric] - a[metric];
		}
		return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
	});
}

/** Most recently read notes first. */
export function sortByLastRead(summaries: NoteSummary[]): NoteSummary[] {
	return [...summaries].sort((a, b) => {
		if (b.lastReadAt !== a.lastReadAt) {
			return b.lastReadAt - a.lastReadAt;
		}
		return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
	});
}
