import { env } from 'cloudflare:workers';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { canonicalJson } from '#/core/canonical-json.ts';
import {
  type FieldInput,
  type SaveLayoutInput,
  saveLayoutInputSchema,
  ulidSchema,
} from '#/core/contracts/index.ts';
import { sha256Hex } from '#/core/hash.ts';
import { limits } from '#/core/limits.ts';
import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import { blobIntents, documents, signers } from '#/db/schema/index.ts';
import { insertAudit, planAudit } from '#/server/domain/audit.ts';
import { AppError } from '#/server/errors.ts';

export const fromTemplateInputSchema = z.strictObject({
  templateId: ulidSchema,
  title: z.string().trim().min(1).max(200),
  /** One entry per signer slot of the template, keyed by the slot's id. */
  signers: z
    .array(
      z.strictObject({
        slotId: ulidSchema,
        name: z.string().max(80),
        email: z.string().max(200),
      }),
    )
    .max(limits.signersPerDocument),
  /** The text for prefilled fields, keyed by the template field's id. */
  prefills: z
    .array(
      z.strictObject({
        fieldId: ulidSchema,
        text: z.string().max(limits.textFieldChars),
      }),
    )
    .max(limits.fieldsPerDocument),
});

export type FromTemplateInput = z.infer<typeof fromTemplateInputSchema>;

export type TemplateSummary = {
  id: string;
  name: string;
  updatedAt: number;
  pageCount: number;
  /** False until the PDF has been stored. Such a template cannot be used yet. */
  ready: boolean;
  signerCount: number;
  fieldCount: number;
  prefilledCount: number;
};

export type TemplateSlot = { id: string; name: string; email: string };
export type TemplatePrefill = {
  fieldId: string;
  label: string;
  text: string;
  pageIndex: number;
  slotId: string;
};

export type TemplateDetail = TemplateSummary & {
  slots: TemplateSlot[];
  prefills: TemplatePrefill[];
};

/** Every template this creator owns, newest first. */
export async function listTemplates(
  ownerId: string,
): Promise<TemplateSummary[]> {
  const rows = await getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.kind, 'template')))
    .orderBy(desc(documents.updatedAt));
  if (rows.length === 0) return [];
  const people = await getDb()
    .select({ documentId: signers.documentId })
    .from(signers)
    .where(
      inArray(
        signers.documentId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => {
    const fields = readFields(row.layoutJson);
    return {
      id: row.id,
      name: row.title,
      updatedAt: row.updatedAt,
      pageCount: row.pageCount,
      ready: row.uploadStatus === 'uploaded',
      signerCount: people.filter((person) => person.documentId === row.id)
        .length,
      fieldCount: fields.length,
      prefilledCount: fields.filter((field) => field.kind === 'prefilled_text')
        .length,
    };
  });
}

/** One template with everything the "use this template" form asks for. */
export async function readTemplate(
  ownerId: string,
  templateId: string,
): Promise<TemplateDetail> {
  const found = await ownedTemplate(templateId, ownerId);
  const slots = await getDb()
    .select()
    .from(signers)
    .where(eq(signers.documentId, templateId))
    .orderBy(asc(signers.signingOrder));
  const fields = readFields(found.layoutJson).sort(
    (left, right) =>
      left.pageIndex - right.pageIndex || left.y - right.y || left.x - right.x,
  );
  const prefilled = fields.filter((field) => field.kind === 'prefilled_text');
  return {
    id: found.id,
    name: found.title,
    updatedAt: found.updatedAt,
    pageCount: found.pageCount,
    ready: found.uploadStatus === 'uploaded',
    signerCount: slots.length,
    fieldCount: fields.length,
    prefilledCount: prefilled.length,
    slots: slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      email: slot.email,
    })),
    prefills: prefilled.map((field, index) => ({
      fieldId: field.id,
      label: field.label?.trim() || `Prefilled text ${index + 1}`,
      text: field.prefill ?? '',
      pageIndex: field.pageIndex,
      slotId: field.signerId,
    })),
  };
}

/**
 * Copies a template into a new draft document and returns its id. The PDF is copied inside R2
 * (same bytes, same hash), every id is new, and the creator's answers replace the template's
 * signer details and prefilled text. The copy is an ordinary draft: it can be edited further,
 * and it is only sent when the creator sends it. The template itself is not touched.
 */
export async function createFromTemplate(input: {
  ownerId: string;
  use: FromTemplateInput;
  now?: number;
}): Promise<{ documentId: string }> {
  const now = input.now ?? Date.now();
  const template = await ownedTemplate(input.use.templateId, input.ownerId);
  if (
    template.uploadStatus !== 'uploaded' ||
    !template.sourceR2Key ||
    !template.sourceSha256 ||
    template.sourceSize == null ||
    !template.geometryJson ||
    !template.geometrySha256
  ) {
    throw new AppError(422, 'This template has no PDF yet.');
  }
  const slots = await getDb()
    .select()
    .from(signers)
    .where(eq(signers.documentId, template.id))
    .orderBy(asc(signers.signingOrder));
  if (slots.length === 0) {
    throw new AppError(422, 'This template has no signers yet.');
  }
  const answers = new Map(input.use.signers.map((item) => [item.slotId, item]));
  const prefills = new Map(
    input.use.prefills.map((item) => [item.fieldId, item.text]),
  );

  const documentId = ulid();
  const slotToSigner = new Map(slots.map((slot) => [slot.id, ulid()]));
  const fields: FieldInput[] = [];
  for (const field of readFields(template.layoutJson)) {
    const signerId = slotToSigner.get(field.signerId);
    if (!signerId) continue;
    const copy: FieldInput = { ...field, id: ulid(), signerId };
    if (field.kind === 'prefilled_text') {
      copy.prefill = (prefills.get(field.id) ?? field.prefill ?? '').trim();
    }
    fields.push(copy);
  }
  const layout: SaveLayoutInput = { documentId, layoutVersion: 1, fields };
  const layoutJson = canonicalJson(layout);
  const layoutSha256 = await sha256Hex(layoutJson);

  const sourceKey = `docs/${documentId}/${template.sourceSha256}.pdf`;
  const original = await env.STORAGE.get(template.sourceR2Key);
  if (!original) {
    throw new AppError(404, "This template's PDF could not be found.");
  }
  await getDb()
    .insert(blobIntents)
    .values({ r2Key: sourceKey, documentId, createdAt: now });
  const stored = await env.STORAGE.put(sourceKey, original.body, {
    sha256: template.sourceSha256,
    httpMetadata: { contentType: 'application/pdf' },
  });
  if (!stored) {
    throw new AppError(500, 'The PDF could not be copied. Try again.');
  }

  const created = await planAudit({
    documentId,
    type: 'document.created',
    actorType: 'owner',
    actorId: input.ownerId,
    occurredAt: now,
    payload: { title: input.use.title, templateId: template.id },
    prev: null,
  });
  const uploaded = await planAudit({
    documentId,
    type: 'document.source_uploaded',
    actorType: 'owner',
    actorId: input.ownerId,
    occurredAt: now,
    payload: { sourceSha256: template.sourceSha256 },
    prev: { seq: created.seq, hash: created.hash },
  });
  const db = getDb();
  await db.batch([
    db.insert(documents).values({
      id: documentId,
      ownerId: input.ownerId,
      title: input.use.title,
      kind: 'document',
      status: 'draft',
      uploadStatus: 'uploaded',
      sourceR2Key: sourceKey,
      sourceSha256: template.sourceSha256,
      sourceSize: template.sourceSize,
      pageCount: template.pageCount,
      geometryJson: template.geometryJson,
      geometrySha256: template.geometrySha256,
      layoutJson,
      layoutSha256,
      layoutVersion: 1,
      version: 0,
      lastOpId: ulid(),
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(signers).values(
      slots.map((slot, index) => {
        const answer = answers.get(slot.id);
        return {
          id: slotToSigner.get(slot.id) ?? ulid(),
          documentId,
          signingOrder: index + 1,
          email: (answer?.email ?? slot.email).trim().toLowerCase(),
          name: (answer?.name ?? slot.name).trim(),
          isSelf: slot.isSelf,
          status: 'pending' as const,
          version: 0,
        };
      }),
    ),
    insertAudit(created),
    insertAudit(uploaded),
  ]);
  return { documentId };
}

/** Removes a template, its signer slots and its stored PDF. Documents made from it are untouched. */
export async function deleteTemplate(input: {
  ownerId: string;
  templateId: string;
}): Promise<{ templateId: string }> {
  const template = await ownedTemplate(input.templateId, input.ownerId);
  const db = getDb();
  await db.batch([
    db.delete(signers).where(eq(signers.documentId, template.id)),
    db
      .delete(documents)
      .where(
        and(
          eq(documents.id, template.id),
          eq(documents.ownerId, input.ownerId),
          eq(documents.kind, 'template'),
        ),
      ),
  ]);
  // The creation event stays; audit rows are append-only and nothing links to a deleted template.
  if (template.sourceR2Key) {
    await env.STORAGE.delete(template.sourceR2Key);
  }
  return { templateId: template.id };
}

export async function assertRoomForTemplate(ownerId: string): Promise<void> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)` })
    .from(documents)
    .where(and(eq(documents.ownerId, ownerId), eq(documents.kind, 'template')));
  if ((row?.count ?? 0) >= limits.templatesPerOwner) {
    throw new AppError(
      422,
      `You can keep up to ${limits.templatesPerOwner} templates. Delete one to add another.`,
    );
  }
}

async function ownedTemplate(templateId: string, ownerId: string) {
  const [found] = await getDb()
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, templateId),
        eq(documents.ownerId, ownerId),
        eq(documents.kind, 'template'),
      ),
    )
    .limit(1);
  if (!found) throw new AppError(404, 'This template was not found.');
  return found;
}

function readFields(layoutJson: string | null): FieldInput[] {
  if (!layoutJson) return [];
  try {
    const parsed = saveLayoutInputSchema.safeParse(JSON.parse(layoutJson));
    return parsed.success
      ? parsed.data.fields.map((field) => ({ ...field }))
      : [];
  } catch {
    return [];
  }
}
