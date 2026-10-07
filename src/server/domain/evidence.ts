import { canonicalJson } from '#/core/canonical-json.ts';
import type {
  FieldInput,
  FieldValue,
  PageGeometryInput,
  SaveLayoutInput,
} from '#/core/contracts/index.ts';
import { sha256Hex } from '#/core/hash.ts';
import type { ManifestSigner } from '#/features/sign/manifest.ts';
import { signCanonical } from '#/server/manifest-key.ts';

export type PrivateEvidence = {
  email: string;
  ip: string;
  userAgent: string;
  consentAt: number;
  invitedAt: number | null;
  firstViewedAt: number | null;
};

export type StoredEvidence = {
  documentId: string;
  signerId: string;
  signedAt: number;
  values: FieldValue[];
  valuesSha256: string;
  privateEvidenceSha256: string;
  email: string;
  ip: string;
  userAgent: string;
  consentAt: number;
  invitedAt: number | null;
  firstViewedAt: number | null;
};

export type ServerManifest = {
  v: 1;
  documentId: string;
  title: string;
  source: { sha256: string; size: number };
  geometrySha256: string;
  layoutSha256: string;
  geometry: PageGeometryInput[];
  layout: SaveLayoutInput;
  signers: ManifestSigner[];
  completedAt: number;
  audit: { headSeq: number; headHash: string };
  renderer: { name: 'digisign-render'; version: '1.0.0' };
};

export async function sealEvidence(input: {
  documentId: string;
  signerId: string;
  signedAt: number;
  values: FieldValue[];
  privateEvidence: PrivateEvidence;
}): Promise<{ evidence: StoredEvidence; canonical: string; sha256: string }> {
  const valuesSha256 = await sha256Hex(canonicalJson(input.values));
  const privateEvidenceSha256 = await sha256Hex(
    canonicalJson(input.privateEvidence),
  );
  const evidence: StoredEvidence = {
    documentId: input.documentId,
    signerId: input.signerId,
    signedAt: input.signedAt,
    values: input.values,
    valuesSha256,
    privateEvidenceSha256,
    ...input.privateEvidence,
  };
  const canonical = canonicalJson(evidence);
  return { evidence, canonical, sha256: await sha256Hex(canonical) };
}

export async function signManifest(manifest: ServerManifest): Promise<{
  canonical: string;
  sha256: string;
  envelopeJson: string;
  keyId: string;
  sig: string;
}> {
  const canonical = canonicalJson(manifest);
  const sha256 = await sha256Hex(canonical);
  const signed = await signCanonical(canonical);
  const envelopeJson = canonicalJson({
    manifest,
    keyId: signed.keyId,
    sig: signed.sig,
  });
  return {
    canonical,
    sha256,
    envelopeJson,
    keyId: signed.keyId,
    sig: signed.sig,
  };
}

export function manifestSigner(input: {
  order: number;
  signerId: string;
  name: string;
  signedAt: number;
  values: FieldValue[];
  valuesSha256: string;
  privateEvidenceSha256: string;
}): ManifestSigner {
  return {
    order: input.order,
    signerId: input.signerId,
    name: input.name,
    signedAt: input.signedAt,
    values: input.values,
    valuesSha256: input.valuesSha256,
    privateEvidenceSha256: input.privateEvidenceSha256,
  };
}

export function evidenceKey(
  documentId: string,
  signerId: string,
  sha256: string,
): string {
  return `evidence/${documentId}/${signerId}/${sha256}.json`;
}

export type { FieldInput };
