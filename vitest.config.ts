import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		coverage: {
			provider: "v8",
			// obsidian-adapter.ts is types-only and has no runtime code.
			include: ["src/core/**/*.ts", "src/controller.ts"],
			reporter: ["text", "text-summary"]
		}
	}
});
