import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			{
				resolve: { tsconfigPaths: true },
				test: {
					name: "node",
					environment: "node",
					include: ["src/**/*.test.ts"],
					exclude: ["src/**/*.worker.test.ts"],
				},
			},
			{
				resolve: { tsconfigPaths: true },
				test: {
					name: "dom",
					environment: "jsdom",
					include: ["src/**/*.dom.test.tsx"],
					setupFiles: ["./src/test/dom-setup.ts"],
				},
			},
			{
				plugins: [
					cloudflareTest({
						wrangler: { configPath: "./wrangler.test.jsonc" },
					}),
				],
				resolve: { tsconfigPaths: true },
				test: {
					name: "workers",
					include: ["src/**/*.worker.test.ts"],
				},
			},
		],
	},
});
