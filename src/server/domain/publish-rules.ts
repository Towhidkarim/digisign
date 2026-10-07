import { z } from 'zod';

import {
  type FieldInput,
  type PageGeometryInput,
  pageGeometrySchema,
} from '#/core/contracts/index.ts';
import { footerStripMicro, ptToMicro, viewSize } from '#/core/coords.ts';
import { limits, minFieldSizePt } from '#/core/limits.ts';
import {
  emailPattern,
  isSigningKind,
  SIGNER_MESSAGES,
} from '#/core/signer-rules.ts';

const geometryList = z.array(pageGeometrySchema);

export type PublishSigner = {
  id: string;
  email: string;
  name: string;
};

export function publishBlocker(input: {
  uploadStatus: string;
  pageCount: number;
  geometryJson: string | null;
  signers: readonly PublishSigner[];
  fields: readonly FieldInput[];
}): string | null {
  if (input.uploadStatus !== 'uploaded') {
    return 'Upload the PDF before sending it.';
  }
  const geometry = geometryList.safeParse(
    input.geometryJson ? JSON.parse(input.geometryJson) : null,
  );
  if (
    !geometry.success ||
    geometry.data.length !== input.pageCount ||
    input.pageCount < 1
  ) {
    return "This PDF's page geometry is not valid.";
  }
  if (
    input.signers.length < 1 ||
    input.signers.length > limits.signersPerDocument
  ) {
    return 'Add between 1 and 10 signers.';
  }
  const signerIds = new Set<string>();
  for (const signer of input.signers) {
    if (!signer.name.trim()) return SIGNER_MESSAGES.name;
    if (!emailPattern.test(signer.email.trim())) {
      return SIGNER_MESSAGES.email;
    }
    signerIds.add(signer.id);
  }
  if (input.fields.length > limits.fieldsPerDocument) {
    return 'This document has too many fields.';
  }
  const perPage = new Map<number, number>();
  const signed = new Set<string>();
  for (const field of input.fields) {
    if (!signerIds.has(field.signerId)) {
      return 'A field is assigned to a signer who is not on this document.';
    }
    if (field.pageIndex >= geometry.data.length) {
      return 'A field sits on a page this PDF does not have.';
    }
    const page = geometry.data[field.pageIndex];
    if (!page) return 'A field sits on a page this PDF does not have.';
    if (!fieldFits(page, field)) {
      return 'A field sits outside the page or on the footer strip.';
    }
    const count = (perPage.get(field.pageIndex) ?? 0) + 1;
    if (count > limits.fieldsPerPage) {
      return 'A page has too many fields.';
    }
    perPage.set(field.pageIndex, count);
    if (isSigningKind(field.kind)) {
      signed.add(field.signerId);
    }
  }
  for (const signer of input.signers) {
    if (!signed.has(signer.id)) {
      return SIGNER_MESSAGES.signature;
    }
  }
  return null;
}

function fieldFits(page: PageGeometryInput, field: FieldInput): boolean {
  if (field.x + field.w > limits.micro || field.y + field.h > limits.micro) {
    return false;
  }
  const strip = footerStripMicro(page);
  if (field.y + field.h > limits.micro - strip) return false;
  const minimum = minFieldSizePt(field.kind);
  if (!minimum) return true;
  const { viewW, viewH } = viewSize(page);
  return (
    field.w >= ptToMicro(minimum.w, viewW) &&
    field.h >= ptToMicro(minimum.h, viewH)
  );
}
