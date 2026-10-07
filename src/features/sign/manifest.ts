import { canonicalJson } from '#/core/canonical-json.ts';
import type {
  FieldValue,
  PageGeometryInput,
  SaveLayoutInput,
  UploadInit,
} from '#/core/contracts/index.ts';
import { sha256Hex } from '#/core/hash.ts';
import type { EditorSigner } from '#/features/editor/reducer.ts';
import type { SignerRecord } from '#/features/sign/session.ts';

export type ManifestSigner = {
  order: number;
  signerId: string;
  name: string;
  signedAt: number;
  values: FieldValue[];
  valuesSha256: string;
  privateEvidenceSha256: string;
};

export type LocalManifest = {
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
};

export async function buildManifest(input: {
  fileName: string;
  upload: UploadInit;
  layout: SaveLayoutInput;
  signers: readonly EditorSigner[];
  records: readonly SignerRecord[];
}): Promise<LocalManifest> {
  const signers: ManifestSigner[] = [];
  for (const record of input.records) {
    const signer = input.signers.find((item) => item.id === record.signerId);
    signers.push({
      order: record.order ?? signers.length + 1,
      signerId: record.signerId,
      name: record.name ?? (signer?.name || 'Signer'),
      signedAt: record.signedAt,
      values: record.values,
      valuesSha256: record.valuesSha256,
      privateEvidenceSha256: record.privateEvidenceSha256,
    });
  }
  const completedAt = signers[signers.length - 1]?.signedAt ?? 0;
  return {
    v: 1,
    documentId: input.upload.documentId,
    title: input.fileName || 'Document',
    source: { sha256: input.upload.sha256, size: input.upload.sizeBytes },
    geometrySha256: await sha256Hex(canonicalJson(input.upload.geometry)),
    layoutSha256: await sha256Hex(canonicalJson(input.layout)),
    geometry: input.upload.geometry.map((page) => ({
      mediaBox: page.mediaBox,
      cropBox: page.cropBox,
      rotate: page.rotate,
    })),
    layout: {
      ...input.layout,
      fields: input.layout.fields.map((field) => ({ ...field })),
    },
    signers,
    completedAt,
  };
}

export function envelopeJson(manifest: LocalManifest): string {
  return canonicalJson({ keyId: 'local', manifest, sig: '' });
}
