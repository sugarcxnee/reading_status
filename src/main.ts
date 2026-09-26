import { MarkdownView, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { computeScrollRatio } from "./core/progress";
import { SystemClock } from "./core/time";
import { StorageService, type DataStore } from "./core/storage";
import { ReadingStatusController } from "./controller";
import type { Host } from "./obsidian-adapter";
import {
	DASHBOARD_VIEW_TYPE,
	ReadingDashboardView,
} from "./view/dashboard";
import { ResetConfirmModal } from "./view/reset-confirm-modal";
import { ReadingStatusSettingTab } from "./settings-tab";
import { serializeExport, parseImport } from "./core/io";
import {
	applyDataRetention,
	pruneDeletedNotes,
	resetNoteStats,
} from "./core/maintenance";
import {
	buildReadingColorGroups,
	mergeColorGroups,
} from "./core/graphColors";
import type { PluginData, PluginSettings } from "./core/types";

const GRAPH_CONFIG_PATH = ".obsidian/graph.json";
const GRAPH_SYNC_INTERVAL_MS = 30_000;

const SCROLLER_SELECTOR = ".cm-scroller, .markdown-preview-view";

/**
 * Obsidian-side implementation of the Host interface. Event registrations use
 * the plugin's automatic cleanup, so the unsubscribe functions are no-ops.
 */
class ObsidianHost implements Host {
	constructor(private readonly plugin: Plugin) {}

	onFileOpened(listener: (path: string | null) => void) {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("file-open", (file) => {
				listener(file instanceof TFile ? file.path : null);
			}),
		);
		return () => {};
	}

	onActiveLeafChanged(listener: () => void) {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", () => listener()),
		);
		return () => {};
	}

	onFocusChanged(listener: (focused: boolean) => void) {
		this.plugin.registerDomEvent(window, "blur", () => listener(false));
		this.plugin.registerDomEvent(window, "focus", () => listener(true));
		this.plugin.registerDomEvent(document, "visibilitychange", () => {
			listener(!document.hidden);
		});
		return () => {};
	}

	onFileRenamed(listener: (oldPath: string, newPath: string) => void) {
		this.plugin.registerEvent(
			this.plugin.app.vault.on("rename", (file, oldPath) => {
				listener(oldPath, file.path);
			}),
		);
		return () => {};
	}

	onFileDeleted(listener: (path: string) => void) {
		this.plugin.registerEvent(
			this.plugin.app.vault.on("delete", (file) => listener(file.path)),
		);
		return () => {};
	}

	onActiveViewScrolled(listener: () => void) {
		const scrollHandler = () => listener();
		let attached: HTMLElement | null = null;

		const detach = () => {
			if (attached !== null) {
				attached.removeEventListener("scroll", scrollHandler);
				attached = null;
			}
		};
		const attach = () => {
			detach();
			const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
			attached =
				view?.contentEl.querySelector<HTMLElement>(SCROLLER_SELECTOR) ?? null;
			attached?.addEventListener("scroll", scrollHandler, { passive: true });
		};

		// Re-attach when the active view or its layout changes, since editing
		// and reading modes use different scroller elements. detach is invoked
		// by the controller on stop.
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", attach),
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("layout-change", attach),
		);
		attach();

		return detach;
	}

	getActiveNotePath(): string | null {
		const file = this.plugin.app.workspace.getActiveFile();
		if (file === null || file.extension !== "md") {
			return null;
		}
		return file.path;
	}

	getActiveScrollRatio(): number | null {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (view === null) {
			return null;
		}
		const scroller = view.contentEl.querySelector<HTMLElement>(SCROLLER_SELECTOR);
		if (scroller === null) {
			return null;
		}
		return computeScrollRatio(
			scroller.scrollTop,
			scroller.scrollHeight,
			scroller.clientHeight,
		);
	}

	async readNoteText(path: string): Promise<string | null> {
		const file = this.plugin.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile) || file.extension !== "md") {
			return null;
		}
		return this.plugin.app.vault.cachedRead(file);
	}
}

export default class ReadingStatusPlugin extends Plugin {
	private controller: ReadingStatusController | null = null;
	private storage: StorageService | null = null;
	private statusBarItem: HTMLElement | null = null;
	private lastGraphSyncAt = 0;
	private graphSyncTimer: ReturnType<typeof setTimeout> | null = null;

	async onload(): Promise<void> {
		const store: DataStore = {
			load: () => this.loadData(),
			save: (data) => this.saveData(data),
		};
		this.storage = new StorageService(store);
		const host = new ObsidianHost(this);
		this.controller = new ReadingStatusController(
			this.storage,
			host,
			new SystemClock(),
		);
		this.controller.onStatusTextChanged = (text) => {
			this.statusBarItem?.setText(text);
		};
		this.controller.onDataChanged = () => {
			this.refreshDashboards();
			this.scheduleGraphSync();
		};
		this.statusBarItem = this.addStatusBarItem();

		// New files should join the unread bucket without waiting for a
		// reading event.
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.scheduleGraphSync();
				}
			}),
		);

		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) =>
				new ReadingDashboardView(
					leaf,
					this.storage as StorageService,
					() => Date.now(),
					(path) => this.confirmReset(path),
				),
		);
		this.addRibbonIcon("book-open", "打开阅读仪表盘", () =>
			void this.activateDashboard(),
		);
		this.addCommand({
			id: "open-reading-dashboard",
			name: "打开阅读仪表盘",
			callback: () => void this.activateDashboard(),
		});
		this.addCommand({
			id: "export-reading-data",
			name: "导出阅读数据为 JSON",
			callback: () => void this.exportDataToFile(),
		});
		this.addCommand({
			id: "import-reading-data",
			name: "从 JSON 导入阅读数据",
			callback: () => void this.importDataFromFilePicker(),
		});
		this.addCommand({
			id: "cleanup-deleted-notes",
			name: "清理已删除笔记的阅读记录",
			callback: () => void this.cleanupDeletedNotes(),
		});
		this.addCommand({
			id: "reset-active-note",
			name: "重置当前笔记的阅读状态",
			callback: () => void this.resetActiveNote(),
		});
		this.addCommand({
			id: "update-graph-colors",
			name: "更新关系图谱颜色",
			callback: () => {
				void this.syncGraphColors();
			},
		});
		this.addSettingTab(
			new ReadingStatusSettingTab(this.app, this),
		);

		await this.controller.start();
		await this.enforceRetention();
		await this.syncGraphColors();
		this.applyStatusBarVisibility();
	}

	onunload(): void {
		this.controller?.stop();
		this.controller = null;
		this.storage = null;
		this.statusBarItem = null;
		if (this.graphSyncTimer !== null) {
			clearTimeout(this.graphSyncTimer);
			this.graphSyncTimer = null;
		}
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			leaf.detach();
		}
	}

	private async activateDashboard(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
		const leaf = existing[0] ?? workspace.getLeaf("tab");
		await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	private refreshDashboards(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
			if (leaf.view instanceof ReadingDashboardView) {
				leaf.view.refresh();
			}
		}
	}

	getSettings(): PluginSettings {
		return (this.storage as StorageService).getData().settings;
	}

	async updateSettings(mutator: (data: PluginData) => void): Promise<void> {
		if (this.storage === null) {
			return;
		}
		mutator(this.storage.getData());
		await this.storage.save();
		this.refreshDashboards();
	}

	applyStatusBarVisibility(): void {
		if (this.statusBarItem === null || this.storage === null) {
			return;
		}
		this.statusBarItem.style.display = this.getSettings().showStatusBar
			? ""
			: "none";
	}

	async enforceRetention(): Promise<void> {
		if (this.storage === null) {
			return;
		}
		if (applyDataRetention(this.storage.getData(), Date.now())) {
			await this.storage.save();
		}
	}

	async exportDataToFile(): Promise<void> {
		if (this.storage === null) {
			return;
		}
		const path = normalizePath("reading-status-export.json");
		const content = serializeExport(this.storage.getData());
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(path, content);
		}
		new Notice(`已导出阅读数据到 ${path}`);
	}

	async importDataFromFilePicker(): Promise<void> {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json,application/json";
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			if (file === undefined) {
				return;
			}
			void file
				.text()
				.then((text) => this.importData(text))
				.catch((error: unknown) => {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`导入失败：${message}`);
				});
		});
		input.click();
	}

	private async importData(text: string): Promise<void> {
		if (this.storage === null) {
			return;
		}
		const imported = parseImport(text);
		await this.storage.replaceData(imported);
		this.controller?.refreshStatusText();
		this.refreshDashboards();
		new Notice("阅读数据导入成功");
	}

	async cleanupDeletedNotes(): Promise<void> {
		if (this.storage === null) {
			return;
		}
		const existing = new Set(this.app.vault.getMarkdownFiles().map((f) => f.path));
		const removed = pruneDeletedNotes(this.storage.getData(), existing);
		if (removed > 0) {
			await this.storage.save();
		}
		this.refreshDashboards();
		new Notice(`已清理 ${removed} 条已删除笔记的记录`);
	}

	/** Ask for confirmation, then reset. Used by the dashboard buttons. */
	private confirmReset(path: string): void {
		new ResetConfirmModal(this.app, path, () => {
			void this.resetNoteByPath(path);
		}).open();
	}

	/**
	 * Reset the reading status of one note: drop its record, persist, then
	 * refresh the status bar, dashboards and graph coloring.
	 */
	async resetNoteByPath(path: string): Promise<void> {
		if (this.storage === null) {
			return;
		}
		if (resetNoteStats(this.storage.getData(), path)) {
			await this.storage.save();
		}
		this.controller?.refreshStatusText();
		this.refreshDashboards();
		this.scheduleGraphSync();
		new Notice(`已重置 ${path} 的阅读状态`);
	}

	async resetActiveNote(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (file === null) {
			new Notice("当前没有打开的笔记");
			return;
		}
		await this.resetNoteByPath(file.path);
	}

	/** Throttled entry point used on data changes and file creation. */
	private scheduleGraphSync(): void {
		const elapsed = Date.now() - this.lastGraphSyncAt;
		if (elapsed >= GRAPH_SYNC_INTERVAL_MS) {
			this.lastGraphSyncAt = Date.now();
			void this.syncGraphColors();
			return;
		}
		if (this.graphSyncTimer === null) {
			this.graphSyncTimer = setTimeout(
				() => {
					this.graphSyncTimer = null;
					this.lastGraphSyncAt = Date.now();
					void this.syncGraphColors();
				},
				GRAPH_SYNC_INTERVAL_MS - elapsed,
			);
		}
	}

	/**
	 * Rewrite only the colorGroups field of the global graph config, keeping
	 * every other option (and any user-created groups) untouched. When the
	 * feature is disabled, the plugin's own groups are removed and the graph
	 * falls back to its default appearance.
	 */
	async syncGraphColors(): Promise<void> {
		if (this.storage === null) {
			return;
		}
		const data = this.storage.getData();
		const adapter = this.app.vault.adapter;
		let raw = "{}";
		try {
			if (await adapter.exists(GRAPH_CONFIG_PATH)) {
				raw = await adapter.read(GRAPH_CONFIG_PATH);
			}
		} catch (error) {
			console.warn("Reading Status: 无法读取关系图谱配置", error);
			return;
		}

		let config: Record<string, unknown>;
		try {
			config = raw.trim() === "" ? {} : (JSON.parse(raw) as Record<string, unknown>);
		} catch (error) {
			console.warn("Reading Status: 关系图谱配置不是有效 JSON，已跳过着色", error);
			return;
		}

		const generated = data.settings.graphColorEnabled
			? buildReadingColorGroups(this.buildProgressIndex(data))
			: [];
		const merged = mergeColorGroups(config.colorGroups, generated);
		const changed = JSON.stringify(merged) !== JSON.stringify(config.colorGroups ?? null);
		config.colorGroups = merged;
		if (!changed) {
			return;
		}
		try {
			await adapter.write(GRAPH_CONFIG_PATH, JSON.stringify(config, null, 2));
		} catch (error) {
			console.warn("Reading Status: 无法写入关系图谱配置", error);
			return;
		}
		this.refreshGraphViews();
	}

	/** Progress of every markdown file; null means never read. */
	private buildProgressIndex(
		data: PluginData,
	): Record<string, number | null> {
		const progressByPath: Record<string, number | null> = {};
		for (const file of this.app.vault.getMarkdownFiles()) {
			progressByPath[file.path] = data.notes[file.path]?.maxProgress ?? null;
		}
		return progressByPath;
	}

	/**
	 * Re-set the view state of open graph leaves so they reload the config.
	 * If this ever fails, closing and reopening the graph applies the new
	 * colors.
	 */
	private refreshGraphViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType("graph")) {
			try {
				const state = leaf.getViewState();
				void leaf.setViewState(state);
			} catch (error) {
				console.warn("Reading Status: 刷新关系图谱失败，请手动重新打开图谱", error);
			}
		}
	}
}
