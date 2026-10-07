import { z } from 'zod';

import { limits } from '#/core/limits.ts';
import { validatePackedStrokes } from '#/core/strokes-codec.ts';

export const CONTRACTS_VERSION = 1;

const finite = z.number().finite();

export const boxSchema = z
  .tuple([finite, finite, finite, finite])
  .refine(
    ([x0, y0, x1, y1]) =>
      x1 > x0 &&
      y1 > y0 &&
      x1 - x0 <= limits.pageExtentMaxPt &&
      y1 - y0 <= limits.pageExtentMaxPt,
    { message: 'Each page box needs a positive extent of at most 14400 pt.' },
  );

export const rotateSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i, 'Expected a ULID.');

export const sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'Expected a SHA-256 hex digest.');

const micro = z.number().int().min(0).max(limits.micro);
const microExtent = z.number().int().min(1).max(limits.micro);

export const pageGeometrySchema = z.strictObject({
  mediaBox: boxSchema,
  cropBox: boxSchema,
  rotate: rotateSchema,
});

export const uploadInitSchema = z
  .strictObject({
    documentId: ulidSchema,
    sha256: sha256Schema,
    sizeBytes: z.number().int().positive().max(limits.pdfSizeBytes),
    pageCount: z.number().int().positive().max(limits.pdfPages),
    geometry: z.array(pageGeometrySchema).max(limits.pdfPages),
  })
  .refine((value) => value.geometry.length === value.pageCount, {
    message: 'Geometry must include one entry per page.',
  });

export const fieldKindSchema = z.enum([
  'signature',
  'initials',
  'date_signed',
  'full_name',
  'text',
  'checkbox',
]);

export const fieldInputSchema = z
  .strictObject({
    id: ulidSchema,
    signerId: ulidSchema,
    pageIndex: z
      .number()
      .int()
      .min(0)
      .max(limits.pdfPages - 1),
    kind: fieldKindSchema,
    x: micro,
    y: micro,
    w: microExtent,
    h: microExtent,
    required: z.boolean(),
  })
  .refine(
    (field) =>
      field.x + field.w <= limits.micro && field.y + field.h <= limits.micro,
    {
      message: 'A field must stay inside the page.',
    },
  );

export const saveLayoutInputSchema = z.strictObject({
  documentId: ulidSchema,
  layoutVersion: z.number().int().nonnegative(),
  fields: z.array(fieldInputSchema).max(limits.fieldsPerDocument),
});

export const signatureInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('drawn'),
    box: z.strictObject({
      w: z.number().int().positive().max(limits.strokeCoordMax),
      h: z.number().int().positive().max(limits.strokeCoordMax),
    }),
    strokes: z.string().superRefine((packed, ctx) => {
      const error = validatePackedStrokes(packed);
      if (error) {
        ctx.addIssue({ code: 'custom', message: error });
      }
    }),
  }),
  z.strictObject({
    kind: z.literal('typed'),
    text: z.string().min(1).max(limits.typedSignatureChars),
    font: z.enum([
      'script-1',
      'script-2',
      'script-3',
      'script-4',
      'script-5',
      'script-6',
    ]),
  }),
]);

export const fieldValueSchema = z.strictObject({
  fieldId: ulidSchema,
  signature: signatureInputSchema.optional(),
  text: z.string().max(limits.textFieldChars).optional(),
  checked: z.boolean().optional(),
});

export const submitSignatureInputSchema = z.strictObject({
  idempotencyKey: z.uuid(),
  stateHash: sha256Schema,
  consent: z.literal(true),
  values: z.array(fieldValueSchema).max(limits.fieldsPerDocument),
});

export type PageGeometryInput = z.infer<typeof pageGeometrySchema>;
export type UploadInit = z.infer<typeof uploadInitSchema>;
export type FieldInput = z.infer<typeof fieldInputSchema>;
export type SaveLayoutInput = z.infer<typeof saveLayoutInputSchema>;
export type SignatureInput = z.infer<typeof signatureInputSchema>;
export type FieldValue = z.infer<typeof fieldValueSchema>;
export type SubmitSignatureInput = z.infer<typeof submitSignatureInputSchema>;
