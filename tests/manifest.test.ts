import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): Record<string, unknown> {
	const raw = readFileSync(join(projectRoot, relativePath), "utf-8");
	return JSON.parse(raw) as Record<string, unknown>;
}

const semverPattern = /^\d+\.\d+\.\d+$/;

describe("manifest.json", () => {
	it("contains all required fields as strings", () => {
		const manifest = readJson("manifest.json");
		for (const field of [
			"id",
			"name",
			"version",
			"minAppVersion",
			"description",
			"author",
		]) {
			expect(manifest[field], `field ${field} should be a non-empty string`).toBeTruthy();
			expect(typeof manifest[field]).toBe("string");
		}
	});

	it("uses a lowercase alphanumeric id with hyphens", () => {
		const manifest = readJson("manifest.json");
		expect(manifest.id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
	});

	it("uses semver for version and minAppVersion", () => {
		const manifest = readJson("manifest.json");
		expect(manifest.version).toMatch(semverPattern);
		expect(manifest.minAppVersion).toMatch(semverPattern);
	});

	it("is not desktop only", () => {
		const manifest = readJson("manifest.json");
		expect(manifest.isDesktopOnly).toBe(false);
	});
});

describe("versions.json", () => {
	it("maps the current plugin version to its min app version", () => {
		const manifest = readJson("manifest.json");
		const versions = readJson("versions.json");
		expect(versions[manifest.version as string]).toBe(manifest.minAppVersion);
	});
});
