import { App, Modal } from "obsidian";

/**
 * Confirmation dialog for resetting a note's reading status. The confirm
 * button uses Obsidian's mod-warning class so destructive styling matches
 * the theme in both light and dark modes.
 */
export class ResetConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly path: string,
		private readonly onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.titleEl.setText("重置阅读状态");
		this.contentEl.createEl("p", {
			cls: "reading-reset-modal-message",
			text: `将清除「${this.path}」的全部阅读记录（次数、时长、进度、已读章节）。该操作不可撤销，是否继续？`,
		});
		const buttons = this.contentEl.createEl("div", {
			cls: "reading-reset-modal-buttons",
		});
		const cancel = buttons.createEl("button", {
			text: "取消",
			attr: { type: "button" },
		});
		cancel.addEventListener("click", () => this.close());
		const confirm = buttons.createEl("button", {
			text: "重置",
			cls: "mod-warning",
			attr: { type: "button" },
		});
		confirm.addEventListener("click", () => {
			this.close();
			this.onConfirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
