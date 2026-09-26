import { parseHeadings, updateReadSections } from "./core/chapters";
import type { Section } from "./core/chapters";
import {
	countReadingUnits,
	estimateRemainingReadingMs,
} from "./core/estimate";
import { buildStatusBarModel, formatStatusBar } from "./core/format";
import { mergeMaxProgress } from "./core/progress";
import { ReadingEngine } from "./core/reading-engine";
import { StorageService } from "./core/storage";
import type { Clock } from "./core/time";
import type { Host, Unsubscribe } from "./obsidian-adapter";

export interface ControllerConfig {
	/** Debounce window for persisting data after mutations. */
	saveDebounceMs: number;
	/** Debounce window for handling scroll events. */
	scrollDebounceMs: number;
	/** Interval that books reading time even without user events. */
	flushIntervalMs: number;
}

const DEFAULT_CONFIG: ControllerConfig = {
	saveDebounceMs: 3_000,
	scrollDebounceMs: 200,
	flushIntervalMs: 30_000,
};

/**
 * Orchestrates the reading engine behind workspace events: opens and closes
 * sessions, updates progress and chapters on scroll, migrates data on
 * rename, refreshes the status bar text and persists with debouncing.
 * Depends only on injected abstractions, so it runs in unit tests.
 */
export class ReadingStatusController {
	onStatusTextChanged: (text: string) => void = () => {};
	/** Notified after a debounced save persisted the current data. */
	onDataChanged: () => void = () => {};

	private engine: ReadingEngine | null = null;
	private sections: Section[] = [];
	/** Reading units of the active note body, or null when unavailable. */
	private activeTotalUnits: number | null = null;
	private readonly unsubscribes: Unsubscribe[] = [];
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private scrollTimer: ReturnType<typeof setTimeout> | null = null;
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private running = false;
	private readonly config: ControllerConfig;

	constructor(
		private readonly storage: StorageService,
		private readonly host: Host,
		private readonly clock: Clock,
		config: Partial<ControllerConfig> = {},
	) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async start(): Promise<void> {
		if (this.running) {
			return;
		}
		const data = await this.storage.load();
		this.engine = new ReadingEngine(data, this.clock);

		this.unsubscribes.push(
			this.host.onFileOpened(() => this.syncActiveView()),
			this.host.onActiveLeafChanged(() => this.syncActiveView()),
			this.host.onFocusChanged((focused) => {
				if (focused) {
					this.engine?.focus();
				} else {
					this.engine?.blur();
				}
			}),
			this.host.onFileRenamed((oldPath, newPath) =>
				this.handleRename(oldPath, newPath),
			),
			this.host.onFileDeleted(() => {
				// Deleted note records are kept until the cleanup command runs.
			}),
			this.host.onActiveViewScrolled(() => this.scheduleScrollUpdate()),
		);

		this.flushTimer = setInterval(() => {
			if (this.engine?.getActivePath() !== null) {
				this.engine?.flush();
				this.refreshStatus();
				this.scheduleSave();
			}
		}, this.config.flushIntervalMs);

		this.running = true;
		this.refreshStatus();
		this.syncActiveView();
	}

	/** Force a status bar refresh (used after data management actions). */
	refreshStatusText(): void {
		this.refreshStatus();
	}

	stop(): void {
		if (!this.running) {
			return;
		}
		this.running = false;
		if (this.flushTimer !== null) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
		if (this.saveTimer !== null) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (this.scrollTimer !== null) {
			clearTimeout(this.scrollTimer);
			this.scrollTimer = null;
		}
		for (const unsubscribe of this.unsubscribes) {
			unsubscribe();
		}
		this.unsubscribes.length = 0;
		if (this.engine !== null) {
			this.engine.flush();
			this.engine.closeActiveNote();
			void this.storage.save();
		}
	}

	private syncActiveView(): void {
		if (this.engine === null) {
			return;
		}
		const path = this.host.getActiveNotePath();
		if (path === this.engine.getActivePath()) {
			return;
		}
		if (path === null) {
			this.engine.closeActiveNote();
			this.sections = [];
			this.activeTotalUnits = null;
		} else {
			this.engine.openNote(path);
			this.sections = [];
			this.activeTotalUnits = null;
			void this.loadSections(path);
		}
		this.refreshStatus();
		this.scheduleSave();
	}

	private async loadSections(path: string): Promise<void> {
		const text = await this.host.readNoteText(path);
		if (this.engine?.getActivePath() !== path) {
			return;
		}
		const level = this.storage.getData().settings.chapterLevel;
		this.sections = text === null ? [] : parseHeadings(text, level);
		this.activeTotalUnits =
			text === null ? null : countReadingUnits(text);
		this.refreshStatus();
	}

	private scheduleScrollUpdate(): void {
		if (this.scrollTimer !== null) {
			return;
		}
		this.scrollTimer = setTimeout(() => {
			this.scrollTimer = null;
			this.handleScroll();
		}, this.config.scrollDebounceMs);
	}

	private handleScroll(): void {
		if (this.engine === null) {
			return;
		}
		const path = this.engine.getActivePath();
		if (path === null) {
			return;
		}
		this.engine.flush();
		const ratio = this.host.getActiveScrollRatio();
		if (ratio !== null) {
			const record = this.storage.getData().notes[path];
			if (record !== undefined) {
				record.maxProgress = mergeMaxProgress(record.maxProgress, ratio);
				record.readSections = updateReadSections(
					this.sections,
					ratio,
					record.readSections,
				);
			}
		}
		this.refreshStatus();
		this.scheduleSave();
	}

	private handleRename(oldPath: string, newPath: string): void {
		if (this.engine === null) {
			return;
		}
		this.engine.applyRename(oldPath, newPath);
		this.refreshStatus();
		this.scheduleSave();
	}

	private refreshStatus(): void {
		if (this.engine === null) {
			this.onStatusTextChanged("");
			return;
		}
		const path = this.engine.getActivePath();
		const record = path === null ? undefined : this.storage.getData().notes[path];
		if (path === null || record === undefined) {
			this.onStatusTextChanged("");
			return;
		}
		const remainingReadingMs =
			this.activeTotalUnits === null
				? null
				: estimateRemainingReadingMs(
						this.activeTotalUnits,
						record.maxProgress,
						this.storage.getData().settings.readingUnitsPerMinute,
					);
		this.onStatusTextChanged(
			formatStatusBar(
				buildStatusBarModel(record, this.sections, remainingReadingMs),
			),
		);
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) {
			return;
		}
		this.saveTimer = setTimeout(() => {
			this.saveTimer = null;
			void this.storage.save();
			this.onDataChanged();
		}, this.config.saveDebounceMs);
	}
}
