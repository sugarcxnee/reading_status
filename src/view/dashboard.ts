import { ItemView, TFile, type WorkspaceLeaf } from "obsidian";
import {
	formatDuration,
	formatRelativeTime,
} from "../core/format";
import { localDayKey } from "../core/time";
import {
	getGlobalStats,
	listNoteSummaries,
	sortByLastRead,
	sortByMetric,
} from "../core/stats";
import type { StorageService } from "../core/storage";

export const DASHBOARD_VIEW_TYPE = "reading-status-dashboard";

const TOP_LIST_SIZE = 10;

/**
 * Sidebar dashboard: global stats, folder/tag filters and two ranked lists.
 * Rendering is plain DOM with Obsidian CSS variables, so dark mode works
 * without extra handling. Data logic lives in core and is unit tested.
 */
export class ReadingDashboardView extends ItemView {
	private folderFilter = "";
	private tagFilter = "";
	private statsEl: HTMLElement | null = null;
	private mostReadEl: HTMLElement | null = null;
	private recentEl: HTMLElement | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly storage: StorageService,
		private readonly now: () => number,
	) {
		super(leaf);
	}

	getViewType(): string {
		return DASHBOARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "阅读仪表盘";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen(): Promise<void> {
		this.addAction("refresh-cw", "刷新", () => this.refresh());
		this.renderSkeleton();
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/** Re-render statistics and lists; keeps filter inputs untouched. */
	refresh(): void {
		if (this.statsEl === null || this.mostReadEl === null || this.recentEl === null) {
			return;
		}
		const data = this.storage.getData();
		const now = this.now();
		const global = getGlobalStats(data, now);

		this.statsEl.empty();
		const entries: Array<[string, string]> = [
			["今日阅读", formatDuration(global.todayReadingMs)],
			["本周阅读", formatDuration(global.weekReadingMs)],
			["记录笔记", `${global.trackedNoteCount} 篇`],
			["累计阅读", formatDuration(global.totalReadingMs)],
		];
		for (const [label, value] of entries) {
			const cell = this.statsEl.createEl("div", {
				cls: "reading-dashboard-stat",
			});
			cell.createEl("div", { cls: "reading-dashboard-stat-label", text: label });
			cell.createEl("div", { cls: "reading-dashboard-stat-value", text: value });
		}

		const filter: { folder?: string; tag?: string } = {};
		if (this.folderFilter.trim() !== "") {
			filter.folder = this.folderFilter.trim();
		}
		if (this.tagFilter.trim() !== "") {
			filter.tag = this.tagFilter.trim().replace(/^#/, "");
		}
		const summaries = listNoteSummaries(data, filter, this.buildTagIndex());

		this.renderList(
			this.mostReadEl,
			summaries.length > 0
				? sortByMetric(summaries, "totalReadingMs").slice(0, TOP_LIST_SIZE)
				: summaries,
			now,
			(summary) => formatDuration(summary.totalReadingMs),
		);
		this.renderList(
			this.recentEl,
			sortByLastRead(summaries).slice(0, TOP_LIST_SIZE),
			now,
			(summary) => formatRelativeTime(summary.lastReadAt, now),
		);
	}

	private renderSkeleton(): void {
		this.contentEl.empty();
		const root = this.contentEl.createEl("div", {
			cls: "reading-dashboard",
		});

		this.statsEl = root.createEl("div", {
			cls: "reading-dashboard-stats",
		});

		const filterSection = root.createEl("div", {
			cls: "reading-dashboard-filters",
		});
		const folderInput = filterSection.createEl("input", {
			cls: "reading-dashboard-input",
			attr: { placeholder: "文件夹过滤", type: "text" },
		});
		const tagInput = filterSection.createEl("input", {
			cls: "reading-dashboard-input",
			attr: { placeholder: "标签过滤", type: "text" },
		});
		folderInput.addEventListener("input", () => {
			this.folderFilter = folderInput.value;
			this.refresh();
		});
		tagInput.addEventListener("input", () => {
			this.tagFilter = tagInput.value;
			this.refresh();
		});

		root.createEl("h4", {
			cls: "reading-dashboard-heading",
			text: "阅读最多",
		});
		this.mostReadEl = root.createEl("ol", {
			cls: "reading-dashboard-list",
		});

		root.createEl("h4", {
			cls: "reading-dashboard-heading",
			text: "最近阅读",
		});
		this.recentEl = root.createEl("ol", {
			cls: "reading-dashboard-list",
		});
	}

	private renderList(
		container: HTMLElement,
		summaries: ReturnType<typeof listNoteSummaries>,
		now: number,
		valueText: (summary: ReturnType<typeof listNoteSummaries>[number]) => string,
	): void {
		container.empty();
		if (summaries.length === 0) {
			container.createEl("li", {
				cls: "reading-dashboard-empty",
				text: "暂无记录",
			});
			return;
		}
		for (const summary of summaries) {
			const item = container.createEl("li", {
				cls: "reading-dashboard-item",
			});
			item.setAttribute(
				"title",
				`首次阅读 ${localDayKey(summary.firstReadAt)} · 最近阅读 ${formatRelativeTime(summary.lastReadAt, now)}`,
			);
			const name = item.createEl("div", {
				cls: "reading-dashboard-item-main",
			});
			name.createEl("span", {
				cls: "reading-dashboard-item-name",
				text: noteDisplayName(summary.path),
			});
			name.createEl("span", {
				cls: "reading-dashboard-item-value",
				text: valueText(summary),
			});
			item.createEl("div", {
				cls: "reading-dashboard-item-sub",
				text: `${summary.path} · ${summary.openCount} 次 · ${Math.round(summary.maxProgress * 100)}% · ${formatRelativeTime(summary.lastReadAt, now)}`,
			});
			item.addEventListener("click", () => this.openNote(summary.path));
		}
	}

	private openNote(path: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			void this.app.workspace.getLeaf("tab").openFile(file);
		}
	}

	private buildTagIndex(): Record<string, string[]> {
		const index: Record<string, string[]> = {};
		for (const file of this.app.vault.getMarkdownFiles()) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache === null) {
				continue;
			}
			const tags = new Set<string>();
			for (const tag of cache.tags ?? []) {
				tags.add(tag.tag.replace(/^#/, ""));
			}
			const frontmatterTags = cache.frontmatter?.tags;
			if (typeof frontmatterTags === "string") {
				for (const tag of frontmatterTags.split(",")) {
					const trimmed = tag.trim();
					if (trimmed !== "") {
						tags.add(trimmed);
					}
				}
			} else if (Array.isArray(frontmatterTags)) {
				for (const tag of frontmatterTags) {
					if (typeof tag === "string" && tag.trim() !== "") {
						tags.add(tag.trim());
					}
				}
			}
			if (tags.size > 0) {
				index[file.path] = [...tags];
			}
		}
		return index;
	}
}

function noteDisplayName(path: string): string {
	const name = path.split("/").pop() ?? path;
	return name.replace(/\.md$/, "");
}
