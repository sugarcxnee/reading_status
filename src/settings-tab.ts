import { App, PluginSettingTab, Setting } from "obsidian";
import type ReadingStatusPlugin from "./main";

/**
 * Settings UI. Every change is written through the plugin's storage so it
 * persists with the rest of the data and takes effect immediately.
 */
export class ReadingStatusSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ReadingStatusPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.plugin.getSettings();

		new Setting(containerEl)
			.setName("章节层级")
			.setDesc("按该级别标题划分章节并统计剩余章节")
			.addDropdown((dropdown) => {
				for (let level = 1; level <= 6; level += 1) {
					dropdown.addOption(String(level), `${level} 级标题`);
				}
				dropdown
					.setValue(String(settings.chapterLevel))
					.onChange(async (value) => {
						await this.plugin.updateSettings((data) => {
							data.settings.chapterLevel = Number.parseInt(value, 10);
						});
					});
			});

		new Setting(containerEl)
			.setName("去重窗口（分钟）")
			.setDesc("在该时间内重复打开同一篇笔记计为一次阅读")
			.addText((text) =>
				text
					.setValue(String(settings.dedupeWindowMs / 60_000))
					.onChange(async (value) => {
						const minutes = Number.parseInt(value, 10);
						if (!Number.isFinite(minutes) || minutes < 1) {
							return;
						}
						await this.plugin.updateSettings((data) => {
							data.settings.dedupeWindowMs = minutes * 60_000;
						});
					}),
			);

		new Setting(containerEl)
			.setName("空闲阈值（秒）")
			.setDesc("窗口失焦超过该时长的时间不计入阅读时长")
			.addText((text) =>
				text
					.setValue(String(settings.idleThresholdMs / 1000))
					.onChange(async (value) => {
						const seconds = Number.parseInt(value, 10);
						if (!Number.isFinite(seconds) || seconds < 1) {
							return;
						}
						await this.plugin.updateSettings((data) => {
							data.settings.idleThresholdMs = seconds * 1000;
						});
					}),
			);

		new Setting(containerEl)
			.setName("显示状态栏")
			.setDesc("在状态栏显示当前笔记的阅读摘要")
			.addToggle((toggle) =>
				toggle.setValue(settings.showStatusBar).onChange(async (value) => {
					await this.plugin.updateSettings((data) => {
						data.settings.showStatusBar = value;
					});
					this.plugin.applyStatusBarVisibility();
				}),
			);

		new Setting(containerEl)
			.setName("排除路径")
			.setDesc("每行一个路径前缀，命中的笔记不参与统计")
			.addTextArea((text) =>
				text
					.setValue(settings.excludedPaths.join("\n"))
					.onChange(async (value) => {
						const paths = value
							.split("\n")
							.map((line) => line.trim())
							.filter((line) => line !== "");
						await this.plugin.updateSettings((data) => {
							data.settings.excludedPaths = paths;
						});
					}),
			);

		new Setting(containerEl)
			.setName("数据保留天数")
			.setDesc("每日聚合数据的保留天数，0 表示永久保留")
			.addText((text) =>
				text
					.setValue(String(settings.dataRetentionDays))
					.onChange(async (value) => {
						const days = Number.parseInt(value, 10);
						if (!Number.isFinite(days) || days < 0) {
							return;
						}
						await this.plugin.updateSettings((data) => {
							data.settings.dataRetentionDays = days;
						});
						await this.plugin.enforceRetention();
					}),
			);

		new Setting(containerEl)
			.setName("关系图谱着色")
			.setDesc("在全局关系图谱中按阅读进度给笔记着色（浅色未读，深色已读完）")
			.addToggle((toggle) =>
				toggle.setValue(settings.graphColorEnabled).onChange(async (value) => {
					await this.plugin.updateSettings((data) => {
						data.settings.graphColorEnabled = value;
					});
					await this.plugin.syncGraphColors();
				}),
			);

		new Setting(containerEl)
			.setName("阅读速度（字/分钟）")
			.setDesc("用于估算剩余阅读时间，中文按字数、英文按词数计算")
			.addText((text) =>
				text
					.setValue(String(settings.readingUnitsPerMinute))
					.onChange(async (value) => {
						const speed = Number.parseInt(value, 10);
						if (!Number.isFinite(speed) || speed < 1) {
							return;
						}
						await this.plugin.updateSettings((data) => {
							data.settings.readingUnitsPerMinute = speed;
						});
					}),
			);

		new Setting(containerEl)
			.setName("数据管理")
			.setDesc("导出、导入、清理与重置入口也在命令面板中可用")
			.addButton((button) =>
				button.setButtonText("导出数据").onClick(() => {
					void this.plugin.exportDataToFile();
				}),
			)
			.addButton((button) =>
				button.setButtonText("导入数据").onClick(() => {
					void this.plugin.importDataFromFilePicker();
				}),
			)
			.addButton((button) =>
				button.setButtonText("清理已删除笔记").onClick(() => {
					void this.plugin.cleanupDeletedNotes();
				}),
			)
			.addButton((button) =>
				button.setButtonText("重置当前笔记").onClick(() => {
					void this.plugin.resetActiveNote();
				}),
			);
	}
}
