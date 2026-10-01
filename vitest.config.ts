import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

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
