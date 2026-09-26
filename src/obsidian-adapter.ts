/**
 * Narrow interface between the controller and the Obsidian workspace. The
 * real implementation lives in main.ts; tests provide fakes. All paths are
 * vault-relative note paths.
 */
export type Unsubscribe = () => void;

export interface Host {
	/** The user opened a note (null when a non-note view took over). */
	onFileOpened(listener: (path: string | null) => void): Unsubscribe;
	/** The active leaf changed for any reason. */
	onActiveLeafChanged(listener: () => void): Unsubscribe;
	/** Window focus changed (blur, focus, visibility). */
	onFocusChanged(listener: (focused: boolean) => void): Unsubscribe;
	/** A file or folder was renamed or moved. */
	onFileRenamed(
		listener: (oldPath: string, newPath: string) => void,
	): Unsubscribe;
	/** A file was deleted. */
	onFileDeleted(listener: (path: string) => void): Unsubscribe;
	/** The active markdown view was scrolled. */
	onActiveViewScrolled(listener: () => void): Unsubscribe;

	getActiveNotePath(): string | null;
	/** Scroll progress of the active view in [0, 1], or null if unavailable. */
	getActiveScrollRatio(): number | null;
	readNoteText(path: string): Promise<string | null>;
}
