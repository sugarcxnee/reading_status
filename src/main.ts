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
import { ReadingStatusSettingTab } from "./settings-tab";
import { serializeExport, parseImport } from "./core/io";
import {
	applyDataRetention,
	pruneDeletedNotes,
	resetNoteStats,
} from "./core/maintenance";
import type { PluginData, PluginSettings } from "./core/types";

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
		};
		this.statusBarItem = this.addStatusBarItem();

		this.registerView(
			DASHBOARD_VIEW_TYPE,
			(leaf) =>
				new ReadingDashboardView(leaf, this.storage as StorageService, () =>
					Date.now(),
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
		this.addSettingTab(
			new ReadingStatusSettingTab(this.app, this),
		);

		await this.controller.start();
		await this.enforceRetention();
		this.applyStatusBarVisibility();
	}

	onunload(): void {
		this.controller?.stop();
		this.controller = null;
		this.storage = null;
		this.statusBarItem = null;
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

	async resetActiveNote(): Promise<void> {
		if (this.storage === null) {
			return;
		}
		const file = this.app.workspace.getActiveFile();
		if (file === null) {
			new Notice("当前没有打开的笔记");
			return;
		}
		if (resetNoteStats(this.storage.getData(), file.path)) {
			await this.storage.save();
		}
		this.controller?.refreshStatusText();
		this.refreshDashboards();
		new Notice(`已重置 ${file.path} 的阅读状态`);
	}
}
