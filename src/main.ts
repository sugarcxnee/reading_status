import { MarkdownView, Plugin, TFile } from "obsidian";
import { computeScrollRatio } from "./core/progress";
import { SystemClock } from "./core/time";
import { StorageService, type DataStore } from "./core/storage";
import { ReadingStatusController } from "./controller";
import type { Host } from "./obsidian-adapter";
import {
	DASHBOARD_VIEW_TYPE,
	ReadingDashboardView,
} from "./view/dashboard";

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

		await this.controller.start();
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
}
