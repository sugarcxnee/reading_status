import { migrate } from "./migrate";
import type { PluginData } from "./types";

/**
 * Minimal persistence boundary. The Obsidian plugin implements this with
 * loadData/saveData; tests use an in-memory fake.
 */
export interface DataStore {
	load(): Promise<unknown>;
	save(data: PluginData): Promise<void>;
}

/**
 * Owns the in-memory PluginData, validates/migrates whatever the DataStore
 * returns, and writes back the same object it hands out so callers can
 * mutate freely and persist with save().
 */
export class StorageService {
	private data: PluginData | null = null;

	constructor(private readonly store: DataStore) {}

	async load(): Promise<PluginData> {
		this.data = migrate(await this.store.load());
		return this.data;
	}

	getData(): PluginData {
		if (this.data === null) {
			throw new Error("StorageService.load must be called before getData.");
		}
		return this.data;
	}

	async update(mutator: (data: PluginData) => void): Promise<void> {
		const data = this.getData();
		mutator(data);
		await this.save();
	}

	async save(): Promise<void> {
		await this.store.save(this.getData());
	}

	/**
	 * Replace the stored content in place, keeping the same object identity
	 * so live holders (the reading engine) observe the imported values.
	 */
	async replaceData(incoming: PluginData): Promise<void> {
		const current = this.getData();
		current.schemaVersion = incoming.schemaVersion;
		current.settings = incoming.settings;
		current.notes = incoming.notes;
		current.days = incoming.days;
		await this.save();
	}
}
