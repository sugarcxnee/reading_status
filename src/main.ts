import { Plugin } from "obsidian";

export default class ReadingStatusPlugin extends Plugin {
	async onload(): Promise<void> {
		// Event wiring and UI registration are added in later stages.
	}

	onunload(): void {
		// No resources to release yet.
	}
}
