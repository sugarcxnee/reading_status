import { localDayKey, startOfNextLocalDay } from "./time";
import type { Clock } from "./time";
import type { DayReadingRecord, NoteReadingRecord, PluginData } from "./types";

/**
 * Session state machine that turns note open/close/blur/focus events into
 * reading statistics on the injected PluginData. All durations are epoch
 * milliseconds taken from the injected Clock.
 *
 * Accounting model: time is measured between an accounting boundary and the
 * current moment whenever an event forces settlement (note switch, close,
 * blur, flush, unload). Focused spans count; blurred spans count only when
 * the blur was shorter than idleThresholdMs, in which case refocusing
 * rewinds the boundary to the moment the blur started.
 */
export class ReadingEngine {
	private activePath: string | null = null;
	/** Start of the not-yet-booked focused span, or null when idle. */
	private boundaryAt: number | null = null;
	private blurStartAt: number | null = null;
	private focused = true;
	/** In-memory close timestamps used for dedupe within this run. */
	private readonly lastCloseAt = new Map<string, number>();

	constructor(
		private readonly data: PluginData,
		private readonly clock: Clock,
	) {}

	getActivePath(): string | null {
		return this.activePath;
	}

	isExcluded(path: string): boolean {
		return this.data.settings.excludedPaths.some(
			(prefix) => prefix.length > 0 && path.startsWith(prefix),
		);
	}

	openNote(path: string): void {
		const now = this.clock.now();
		if (this.activePath === path) {
			return;
		}
		this.closeActiveNote();
		if (this.isExcluded(path)) {
			return;
		}

		const isNew = !(path in this.data.notes);
		const record = this.ensureRecord(path, now);
		// Dedupe fallback for a fresh run: the persisted lastReadAt doubles as
		// the close time of the previous session.
		const lastClose = this.lastCloseAt.get(path) ?? record.lastReadAt;
		if (isNew || now - lastClose > this.data.settings.dedupeWindowMs) {
			record.openCount += 1;
			this.ensureDay(localDayKey(now)).openCount += 1;
		}
		record.lastReadAt = now;
		this.activePath = path;
		this.boundaryAt = now;
	}

	closeActiveNote(): void {
		const now = this.clock.now();
		const path = this.activePath;
		if (path === null) {
			return;
		}
		this.settle(now);
		this.lastCloseAt.set(path, now);
		this.activePath = null;
		this.boundaryAt = null;
	}

	blur(): void {
		if (!this.focused) {
			return;
		}
		const now = this.clock.now();
		this.settle(now);
		this.focused = false;
		this.blurStartAt = now;
	}

	focus(): void {
		if (this.focused) {
			return;
		}
		const now = this.clock.now();
		this.focused = true;
		if (this.activePath !== null && this.blurStartAt !== null) {
			const idleSpan = now - this.blurStartAt;
			this.boundaryAt =
				idleSpan <= this.data.settings.idleThresholdMs
					? this.blurStartAt
					: now;
		}
		this.blurStartAt = null;
	}

	/** Book the focused time accumulated so far without ending the session. */
	flush(): void {
		this.settle(this.clock.now());
	}

	private settle(now: number): void {
		const path = this.activePath;
		if (path === null || this.boundaryAt === null || !this.focused) {
			return;
		}
		const from = this.boundaryAt;
		if (now > from) {
			const record = this.ensureRecord(path, now);
			record.totalReadingMs += now - from;
			record.lastReadAt = now;
			this.bookDays(from, now);
		}
		this.boundaryAt = now;
	}

	/** Attribute a span to day buckets, splitting it at local midnight. */
	private bookDays(from: number, to: number): void {
		let cursor = from;
		while (cursor < to) {
			const midnight = startOfNextLocalDay(cursor);
			const end = Math.min(to, midnight);
			this.ensureDay(localDayKey(cursor)).readingMs += end - cursor;
			cursor = end;
		}
	}

	private ensureRecord(path: string, now: number): NoteReadingRecord {
		let record = this.data.notes[path];
		if (record === undefined) {
			record = {
				openCount: 0,
				totalReadingMs: 0,
				firstReadAt: now,
				lastReadAt: now,
				maxProgress: 0,
				readSections: [],
			};
			this.data.notes[path] = record;
		}
		return record;
	}

	private ensureDay(dayKey: string): DayReadingRecord {
		let day = this.data.days[dayKey];
		if (day === undefined) {
			day = { readingMs: 0, openCount: 0 };
			this.data.days[dayKey] = day;
		}
		return day;
	}
}
