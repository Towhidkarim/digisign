import type {
  FieldValue,
  PageGeometryInput,
  SaveLayoutInput,
} from '#/core/contracts/index.ts';

export type ManifestSigner = {
  order: number;
  signerId: string;
  name: string;
  signedAt: number;
  values: FieldValue[];
  valuesSha256: string;
  privateEvidenceSha256: string;
};

/**
 * What the renderer draws from: the signed server manifest without the audit head and renderer
 * stamp. The signed PDF embeds the server's own signed envelope, not a rebuilt copy.
 */
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
