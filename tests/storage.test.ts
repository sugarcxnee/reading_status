import { describe, expect, it, vi } from "vitest";
import { StorageService, type DataStore } from "../src/core/storage";
import { CURRENT_SCHEMA_VERSION } from "../src/core/migrate";
import type { PluginData } from "../src/core/types";

function createMemoryStore(initial: unknown = null): DataStore & {
	saved: PluginData[];
} {
	const saved: PluginData[] = [];
	return {
		saved,
		load: vi.fn(async () => initial),
		save: vi.fn(async (data: PluginData) => {
			saved.push(structuredClone(data));
		}),
	};
}

describe("StorageService", () => {
	it("loads fresh default data when nothing is stored", async () => {
		const store = createMemoryStore(null);
		const storage = new StorageService(store);
		const data = await storage.load();
		expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		expect(data.notes).toEqual({});
		expect(data.days).toEqual({});
	});

	it("loads and migrates stored data", async () => {
		const store = createMemoryStore({ notes: { "a.md": { openCount: 1 } } });
		const storage = new StorageService(store);
		const data = await storage.load();
		expect(data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
		// v0 records lack readSections; migration fills it in.
		expect(data.notes["a.md"]?.readSections).toEqual([]);
	});

	it("rejects data from a newer schema version", async () => {
		const store = createMemoryStore({ schemaVersion: 99 });
		const storage = new StorageService(store);
		await expect(storage.load()).rejects.toThrow(/newer/i);
	});

	it("getData throws before load is called", () => {
		const storage = new StorageService(createMemoryStore());
		expect(() => storage.getData()).toThrow(/load/i);
	});

	it("update applies a mutation and persists the result", async () => {
		const store = createMemoryStore(null);
		const storage = new StorageService(store);
		await storage.load();
		await storage.update((data) => {
			data.notes["new.md"] = {
				openCount: 1,
				totalReadingMs: 0,
				firstReadAt: 100,
				lastReadAt: 100,
				maxProgress: 0,
				readSections: [],
			};
		});
		expect(storage.getData().notes["new.md"].openCount).toBe(1);
		expect(store.save).toHaveBeenCalledTimes(1);
		expect(store.saved[0].notes["new.md"].openCount).toBe(1);
	});

	it("exposes the same object identity so callers can mutate then save", async () => {
		const store = createMemoryStore(null);
		const storage = new StorageService(store);
		await storage.load();
		const data = storage.getData();
		data.days["2026-09-26"] = { readingMs: 5, openCount: 1 };
		await storage.save();
		expect(store.saved[0].days["2026-09-26"]).toEqual({ readingMs: 5, openCount: 1 });
	});
});
