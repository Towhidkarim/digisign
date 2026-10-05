import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { sha256Hex } from "#/core/hash.ts";
import { type Identified, identifyPdf } from "#/features/verify/identify.ts";
import {
	classify,
	type FoundRecord,
	type Outcome,
	outcomeText,
	recordIsGenuine,
	toLocalManifest,
} from "#/features/verify/outcome.ts";
import { loadScriptFonts } from "#/pdf/fonts.ts";
import { render } from "#/pdf/render.ts";
import { verifyManifestFn } from "#/server/verify.ts";

const ID = /^[0-9A-Za-z]{10,40}$/;

type Result = {
	outcome: Outcome;
	record: Awaited<ReturnType<typeof verifyManifestFn>>;
	compared: boolean;
};

export function VerifyDesk({ initialId }: { initialId?: string }) {
	const [typedId, setTypedId] = useState(initialId ?? "");
	const [fileName, setFileName] = useState("");
	const [identified, setIdentified] = useState<Identified | null>(null);
	const [result, setResult] = useState<Result | null>(null);
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const droppedRef = useRef<Uint8Array | null>(null);

	const run = useCallback(
		async (id: string, bytes: Uint8Array | null, found: Identified | null) => {
			setBusy(true);
			setMessage("");
			setResult(null);
			try {
				const record = await verifyManifestFn({ data: { documentId: id } });
				if (!recordIsGenuine(record)) {
					setResult({ outcome: "invalid", record, compared: false });
					return;
				}
				if (!bytes) {
					setResult({ outcome: "no-manifest", record, compared: false });
					return;
				}
				const droppedSha256 = await sha256Hex(bytes);
				let renderedSha256: string | null = null;
				if (found?.embeddedManifest) {
					renderedSha256 = await renderedHash(record, found.verifyOrigin);
					if (renderedSha256 === null) {
						setMessage(
							"The original PDF could not be re-rendered for comparison. Try again in a moment.",
						);
						return;
					}
				}
				setResult({
					outcome: classify({
						record,
						embeddedManifest: Boolean(found?.embeddedManifest),
						droppedSha256,
						renderedSha256,
					}),
					record,
					compared: true,
				});
			} catch (caught) {
				setMessage(
					caught instanceof Error
						? caught.message
						: "The check could not finish.",
				);
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	useEffect(() => {
		if (initialId && ID.test(initialId)) void run(initialId, null, null);
	}, [initialId, run]);

	async function choose(file: File | undefined) {
		if (!file) return;
		setResult(null);
		setMessage("");
		setFileName(file.name);
		const bytes = new Uint8Array(await file.arrayBuffer());
		droppedRef.current = bytes;
		const found = await identifyPdf(bytes);
		setIdentified(found);
		const id =
			found.documentId ?? (ID.test(typedId.trim()) ? typedId.trim() : null);
		if (!id) {
			setMessage(
				"This file names no DigiSign document. Type the document id below.",
			);
			return;
		}
		setTypedId(id);
		await run(id, bytes, found);
	}

	async function checkTyped() {
		const id = typedId.trim();
		if (!ID.test(id)) {
			setMessage("Enter the document id printed in the PDF footer.");
			return;
		}
		await run(id, droppedRef.current, identified);
	}

	return (
		<main className="sheet">
			<p className="wordmark">DigiSign</p>
			<h1 className="doc-title">Verify a signed document</h1>
			<p>
				Your file is checked in this browser and is never uploaded. DigiSign
				compares it with the signed record.
			</p>
			<label className="block" htmlFor="verify-file">
				<span className="text-sm">Signed PDF</span>
				<input
					id="verify-file"
					type="file"
					accept="application/pdf"
					className="mt-1 block"
					onChange={(event) => void choose(event.target.files?.[0])}
				/>
			</label>
			{fileName && identified ? (
				<p className="text-sm text-muted-foreground">
					{fileName}
					{identified.documentId
						? ` names document ${identified.documentId} (from its ${identified.via}).`
						: " names no DigiSign document."}
				</p>
			) : null}
			<div className="mt-4 flex items-end gap-2">
				<label className="text-sm" htmlFor="verify-id">
					Document id
					<input
						id="verify-id"
						value={typedId}
						onChange={(event) => setTypedId(event.target.value)}
						className="mt-1 block rounded-md border px-2 py-1"
					/>
				</label>
				<Button type="button" disabled={busy} onClick={() => void checkTyped()}>
					{busy ? "Checking…" : "Check"}
				</Button>
			</div>
			{message ? (
				<p className="mt-3 text-sm text-destructive">{message}</p>
			) : null}
			{result ? <ResultPanel result={result} /> : null}
		</main>
	);
}

async function renderedHash(
	record: FoundRecord,
	origin: string | null,
): Promise<string | null> {
	try {
		const response = await fetch(
			`/files/documents/${record.documentId}/source?grant=${encodeURIComponent(record.grant)}`,
		);
		if (!response.ok) return null;
		const original = new Uint8Array(await response.arrayBuffer());
		if ((await sha256Hex(original)) !== record.manifest.source.sha256)
			return null;
		const rendered = await render(original, toLocalManifest(record), {
			fonts: await loadScriptFonts(),
			verifyOrigin: origin ?? window.location.origin,
		});
		return await sha256Hex(rendered);
	} catch {
		return null;
	}
}

function ResultPanel({ result }: { result: Result }) {
	const text = outcomeText[result.outcome];
	const record = result.record.found ? result.record : null;
	return (
		<section className="mt-6" aria-live="polite" data-outcome={result.outcome}>
			<h2 className="text-xl font-semibold">{text.title}</h2>
			<p>{text.detail}</p>
			{record && !result.compared ? (
				<p className="text-sm text-muted-foreground">
					Add the signed PDF above to compare it with this record.
				</p>
			) : null}
			{record ? (
				<>
					<p className="mt-3 text-sm">
						{record.title} · completed{" "}
						{new Date(record.manifest.completedAt).toLocaleString()} ·{" "}
						{record.anchored ? "anchored" : "anchoring"}
					</p>
					<ul className="mt-2 text-sm">
						<li>
							Signature{" "}
							{record.checks.signature ? "verified" : "does not match"}
						</li>
						<li>
							Manifest hash{" "}
							{record.checks.manifestSha256 ? "matches" : "differs"}
						</li>
						<li>
							Original PDF{" "}
							{record.checks.sourceSha256 && record.checks.sourceStored
								? "intact"
								: "differs"}
						</li>
						<li>
							Audit chain {record.checks.auditChain ? "unbroken" : "broken"}
						</li>
					</ul>
					<h3 className="mt-3 text-sm font-medium">Signers</h3>
					<ol className="text-sm">
						{record.manifest.signers.map((signer) => (
							<li key={signer.signerId}>
								{signer.order}. {signer.name} ·{" "}
								{new Date(signer.signedAt).toLocaleString()}
							</li>
						))}
					</ol>
				</>
			) : null}
		</section>
	);
}
