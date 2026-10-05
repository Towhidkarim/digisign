import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/.well-known/digisign-keys.json")({
	server: {
		handlers: {
			GET: async () => {
				const { exportManifestPublicJwk } = await import(
					"#/server/manifest-key.ts"
				);
				const jwk = await exportManifestPublicJwk();
				return Response.json(
					{ algorithm: "Ed25519", keys: [jwk] },
					{ headers: { "cache-control": "public, max-age=300" } },
				);
			},
		},
	},
});
