import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReadingStatusController } from "../../src/controller";
import type { Host, Unsubscribe } from "../../src/obsidian-adapter";
import { StorageService, type DataStore } from "../../src/core/storage";
import { createDefaultData } from "../../src/core/defaults";
import type { PluginData } from "../../src/core/types";
import { FakeClock } from "../helpers/fake-clock";

const T0 = new Date(2026, 8, 26, 10, 0, 0).getTime();
const MIN = 60_000;

class FakeHost implements Host {
	activePath: string | null = null;
	scrollRatio: number | null = 0;
	readonly texts = new Map<string, string>();

	private readonly fileOpenListeners = new Set<(path: string | null) => void>();
	private readonly leafChangeListeners = new Set<() => void>();
	private readonly focusListeners = new Set<(focused: boolean) => void>();
	private readonly renameListeners = new Set<(oldPath: string, newPath: string) => void>();
	private readonly deleteListeners = new Set<(path: string) => void>();
	private readonly scrollListeners = new Set<() => void>();

	onFileOpened(listener: (path: string | null) => void): Unsubscribe {
		this.fileOpenListeners.add(listener);
		return () => this.fileOpenListeners.delete(listener);
	}

	onActiveLeafChanged(listener: () => void): Unsubscribe {
		this.leafChangeListeners.add(listener);
		return () => this.leafChangeListeners.delete(listener);
	}

	onFocusChanged(listener: (focused: boolean) => void): Unsubscribe {
		this.focusListeners.add(listener);
		return () => this.focusListeners.delete(listener);
	}

	onFileRenamed(
		listener: (oldPath: string, newPath: string) => void,
	): Unsubscribe {
		this.renameListeners.add(listener);
		return () => this.renameListeners.delete(listener);
	}

	onFileDeleted(listener: (path: string) => void): Unsubscribe {
		this.deleteListeners.add(listener);
		return () => this.deleteListeners.delete(listener);
	}

	onActiveViewScrolled(listener: () => void): Unsubscribe {
		this.scrollListeners.add(listener);
		return () => this.scrollListeners.delete(listener);
	}

	getActiveNotePath(): string | null {
		return this.activePath;
	}

	getActiveScrollRatio(): number | null {
		return this.scrollRatio;
	}

	async readNoteText(path: string): Promise<string | null> {
		return this.texts.get(path) ?? null;
	}

	fireFileOpen(path: string | null): void {
		this.activePath = path;
		for (const listener of this.fileOpenListeners) listener(path);
	}

	fireLeafChange(): void {
		for (const listener of this.leafChangeListeners) listener();
	}

	fireFocus(focused: boolean): void {
		for (const listener of this.focusListeners) listener(focused);
	}

	fireRename(oldPath: string, newPath: string): void {
		for (const listener of this.renameListeners) listener(oldPath, newPath);
	}

	fireScroll(): void {
		for (const listener of this.scrollListeners) listener();
	}
}

function setup(settingsOverrides: Record<string, unknown> = {}) {
	vi.useFakeTimers();
	let stored: unknown = null;
	if (Object.keys(settingsOverrides).length > 0) {
		// Settings flow through the real migration pipeline.
		stored = { schemaVersion: 1, settings: settingsOverrides, notes: {}, days: {} };
	}
	let saveCount = 0;
	const store: DataStore = {
		load: async () => stored,
		save: async (saved: PluginData) => {
			saveCount += 1;
			stored = structuredClone(saved);
		},
	};
	const host = new FakeHost();
	const clock = new FakeClock(T0);
	const storage = new StorageService(store);
	const controller = new ReadingStatusController(storage, host, clock, {
		saveDebounceMs: 3000,
		scrollDebounceMs: 200,
		flushIntervalMs: 30_000,
	});
	const statusTexts: string[] = [];
	controller.onStatusTextChanged = (text) => statusTexts.push(text);
	return { controller, host, clock, storage, statusTexts, getSaveCount: () => saveCount };
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("ReadingStatusController", () => {
	it("starts with an empty status bar and tracks nothing", async () => {
		const { controller, statusTexts } = setup();
		await controller.start();
		expect(statusTexts.at(-1)).toBe("");
	});

	it("opens a session on file open and shows the summary", async () => {
		const { controller, host, storage, statusTexts } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		expect(storage.getData().notes["a.md"].openCount).toBe(1);
		expect(statusTexts.at(-1)).toBe("阅读 1 次 · 0 分钟 · 0%");
	});

	it("does not track excluded paths", async () => {
		const { controller, host, storage, statusTexts } = setup({
			excludedPaths: ["日记/"],
		});
		await controller.start();
		host.fireFileOpen("日记/2026-09-26.md");
		await flushMicrotasks();
		expect(storage.getData().notes).toEqual({});
		expect(statusTexts.at(-1)).toBe("");
	});

	it("updates progress and chapters on scroll", async () => {
		const { controller, host, storage, statusTexts } = setup();
		await controller.start();
		host.texts.set(
			"b.md",
			"## A\n\n## B\n\n## C\n",
		);
		host.fireFileOpen("b.md");
		await flushMicrotasks();
		host.scrollRatio = 0.5;
		host.fireScroll();
		vi.advanceTimersByTime(200);
		const record = storage.getData().notes["b.md"];
		expect(record.maxProgress).toBe(0.5);
		expect(record.readSections).toEqual(["A", "B"]);
		expect(statusTexts.at(-1)).toBe("阅读 1 次 · 0 分钟 · 50% · 剩 1 章");
	});

	it("never lowers recorded progress", async () => {
		const { controller, host, storage } = setup();
		await controller.start();
		host.texts.set("b.md", "## A\n\n## B\n\n## C\n");
		host.fireFileOpen("b.md");
		await flushMicrotasks();
		host.scrollRatio = 0.5;
		host.fireScroll();
		vi.advanceTimersByTime(200);
		host.scrollRatio = 0.2;
		host.fireScroll();
		vi.advanceTimersByTime(200);
		const record = storage.getData().notes["b.md"];
		expect(record.maxProgress).toBe(0.5);
		expect(record.readSections).toEqual(["A", "B"]);
	});

	it("migrates data when a note is renamed", async () => {
		const { controller, host, storage } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		host.fireRename("a.md", "renamed.md");
		expect(storage.getData().notes["renamed.md"]).toBeTruthy();
		expect(storage.getData().notes["a.md"]).toBeUndefined();
	});

	it("migrates data when a folder is renamed", async () => {
		const { controller, host, storage } = setup();
		await controller.start();
		host.fireFileOpen("数学分析/上册/a.md");
		await flushMicrotasks();
		host.fireRename("数学分析/上册", "数学分析/第一册");
		expect(storage.getData().notes["数学分析/第一册/a.md"]).toBeTruthy();
		expect(storage.getData().notes["数学分析/上册/a.md"]).toBeUndefined();
	});

	it("closes the session when the active leaf is no longer a note", async () => {
		const { controller, host, clock, storage, statusTexts } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		clock.advance(5 * MIN);
		host.activePath = null;
		host.fireLeafChange();
		expect(storage.getData().notes["a.md"].totalReadingMs).toBe(5 * MIN);
		expect(statusTexts.at(-1)).toBe("");
	});

	it("excludes long blur spans from reading time", async () => {
		const { controller, host, clock, storage } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		clock.advance(MIN);
		host.fireFocus(false);
		clock.advance(10 * MIN);
		host.fireFocus(true);
		clock.advance(MIN);
		host.scrollRatio = 0;
		host.fireScroll();
		vi.advanceTimersByTime(200);
		expect(storage.getData().notes["a.md"].totalReadingMs).toBe(2 * MIN);
	});

	it("persists through the debounced save", async () => {
		const { controller, host, getSaveCount } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		host.scrollRatio = 0.3;
		host.fireScroll();
		vi.advanceTimersByTime(200);
		expect(getSaveCount()).toBe(0);
		vi.advanceTimersByTime(3000);
		expect(getSaveCount()).toBe(1);
	});

	it("books time on the periodic flush without user events", async () => {
		const { controller, host, clock, storage, getSaveCount } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		clock.advance(10 * MIN);
		vi.advanceTimersByTime(30_000);
		expect(storage.getData().notes["a.md"].totalReadingMs).toBe(10 * MIN);
		vi.advanceTimersByTime(3000);
		expect(getSaveCount()).toBeGreaterThanOrEqual(1);
	});

	it("flushes and saves on stop", async () => {
		const { controller, host, clock, storage, getSaveCount } = setup();
		await controller.start();
		host.fireFileOpen("a.md");
		await flushMicrotasks();
		clock.advance(4 * MIN);
		controller.stop();
		expect(storage.getData().notes["a.md"].totalReadingMs).toBe(4 * MIN);
		expect(getSaveCount()).toBe(1);
	});
});
