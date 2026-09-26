import { localDayKey } from "./time";
import type { PluginData } from "./types";

/**
 * Remove tracking records for notes that no longer exist in the vault.
 * Returns how many records were removed.
 */
export function pruneDeletedNotes(
	data: PluginData,
	existingPaths: ReadonlySet<string>,
): number {
	let removed = 0;
	for (const path of Object.keys(data.notes)) {
		if (!existingPaths.has(path)) {
			delete data.notes[path];
			removed += 1;
		}
	}
	return removed;
}

/** Delete the record of a single note. Returns false if it had none. */
export function resetNoteStats(data: PluginData, path: string): boolean {
	if (data.notes[path] === undefined) {
		return false;
	}
	delete data.notes[path];
	return true;
}

/**
 * Enforce settings.dataRetentionDays on the daily aggregates. Day keys are
 * ISO dates, so lexicographic comparison matches chronological order across
 * month and year boundaries. Returns true when records were removed.
 */
export function applyDataRetention(data: PluginData, now: number): boolean {
	const retentionDays = data.settings.dataRetentionDays;
	if (retentionDays <= 0) {
		return false;
	}
	const cutoffDay = localDayKey(now - retentionDays * 86_400_000);
	let removed = false;
	for (const day of Object.keys(data.days)) {
		if (day < cutoffDay) {
			delete data.days[day];
			removed = true;
		}
	}
	return removed;
}
