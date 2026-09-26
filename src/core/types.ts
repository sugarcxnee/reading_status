export const CURRENT_SCHEMA_VERSION = 1;

/** User-configurable plugin behavior. Persisted inside PluginData. */
export interface PluginSettings {
	/** Heading level (1-6) that splits a note into chapters. */
	chapterLevel: number;
	/** Reopening the same note within this window counts as one visit. */
	dedupeWindowMs: number;
	/** Window blur longer than this threshold is not counted as reading time. */
	idleThresholdMs: number;
	/** Whether the status bar item is shown. */
	showStatusBar: boolean;
	/** Path prefixes that should never be tracked. */
	excludedPaths: string[];
	/** How many days of daily aggregates to keep. 0 means forever. */
	dataRetentionDays: number;
	/** Color notes in the global graph by reading progress. */
	graphColorEnabled: boolean;
}

/** Per-note reading statistics, keyed by vault-relative note path. */
export interface NoteReadingRecord {
	openCount: number;
	totalReadingMs: number;
	firstReadAt: number;
	lastReadAt: number;
	/** Highest scroll progress ever reached, in [0, 1]. */
	maxProgress: number;
	/** Normalized heading texts of sections considered read. */
	readSections: string[];
}

/** Per-day reading aggregates, keyed by local-timezone YYYY-MM-DD. */
export interface DayReadingRecord {
	readingMs: number;
	openCount: number;
}

/** Root object persisted via Plugin.loadData/saveData. */
export interface PluginData {
	schemaVersion: number;
	settings: PluginSettings;
	notes: Record<string, NoteReadingRecord>;
	days: Record<string, DayReadingRecord>;
}
