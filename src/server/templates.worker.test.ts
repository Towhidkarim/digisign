import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FieldInput, PageGeometryInput } from '#/core/contracts/index.ts';
import { ptToMicro } from '#/core/coords.ts';
import { sha256Hex } from '#/core/hash.ts';
import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import { documents, signers } from '#/db/schema/index.ts';
import { requiredFields } from '#/features/sign/desk-model.ts';
import {
  createDraft,
  getDraft,
  initUpload,
  listOwnedDocuments,
  publish,
  readOwnedDocument,
  savePreparation,
} from '#/server/domain/documents.ts';
import {
  exchangeSignerToken,
  getSigningContext,
  submitSignature,
} from '#/server/domain/signing.ts';
import { putDocumentSource } from '#/server/domain/source.ts';
import {
  createFromTemplate,
  deleteTemplate,
  listTemplates,
  readTemplate,
} from '#/server/domain/templates.ts';
import type { QueueEnvelope } from '#/server/engine/events.ts';
import { publishOutbox } from '#/server/engine/outbox.ts';
import { setMailer } from '#/server/mail/index.ts';
import { createMemoryMailer } from '#/server/mail/memory.ts';
import {
  captureQueue,
  DEV_OWNER_ID,
  migrate,
  ORIGIN,
  pump,
  tokenFor,
} from '#/server/test-support.ts';

const letter: PageGeometryInput = {
  mediaBox: [0, 0, 612, 792],
  cropBox: [0, 0, 612, 792],
  rotate: 0,
};

let sent: QueueEnvelope[];
let mail: ReturnType<typeof createMemoryMailer>;

beforeAll(async () => {
  await migrate();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user (id, name, email) VALUES (?, ?, ?)',
  )
    .bind(DEV_OWNER_ID, 'Olivia Owner', 'olivia@example.com')
    .run();
});

beforeEach(() => {
  mail = createMemoryMailer();
  setMailer(mail);
  sent = captureQueue();
});

function field(signerId: string, overrides: Partial<FieldInput>): FieldInput {
  return {
    id: ulid(),
    signerId,
    pageIndex: 0,
    kind: 'signature',
    x: 10_000,
    y: 10_000,
    w: ptToMicro(160, 612),
    h: ptToMicro(40, 792),
    required: true,
    ...overrides,
  };
}

/** A saved template with one signer slot, a signature, and one prefilled text field. */
async function buildTemplate() {
  const bytes = new TextEncoder().encode(`%PDF-1.4\ntemplate ${ulid()}`);
  const id = ulid();
  await createDraft({
    id,
    title: 'Service agreement',
    kind: 'template',
    ownerId: DEV_OWNER_ID,
  });
  await initUpload({
    ownerId: DEV_OWNER_ID,
    upload: {
      documentId: id,
      sha256: await sha256Hex(bytes),
      sizeBytes: bytes.byteLength,
      pageCount: 1,
      geometry: [letter],
    },
  });
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const stored = await putDocumentSource({
    documentId: id,
    ownerId: DEV_OWNER_ID,
    body: new Blob([copy]).stream(),
    contentLength: bytes.byteLength,
  });
  expect(stored.uploadStatus).toBe('uploaded');
  const slot = { id: ulid(), name: 'Client', email: '' };
  const signature = field(slot.id, {});
  const client = field(slot.id, {
    kind: 'prefilled_text',
    label: 'Client name',
    prefill: '',
    y: 200_000,
    w: ptToMicro(200, 612),
    h: ptToMicro(22, 792),
  });
  const draft = await getDraft(id, DEV_OWNER_ID);
  await savePreparation({
    ownerId: DEV_OWNER_ID,
    documentId: id,
    layoutVersion: draft.document.layoutVersion,
    signers: [slot],
    fields: [signature, client],
  });
  return { id, slot, signature, client, bytes };
}

describe('templates', () => {
  it('lists templates apart from documents, with what the form asks for', async () => {
    const built = await buildTemplate();
    const templates = await listTemplates(DEV_OWNER_ID);
    expect(templates.map((item) => item.id)).toContain(built.id);
    const documentsList = await listOwnedDocuments(DEV_OWNER_ID);
    expect(documentsList.map((item) => item.id)).not.toContain(built.id);
    await expect(readOwnedDocument(DEV_OWNER_ID, built.id)).rejects.toThrow(
      /not found/,
    );
    const detail = await readTemplate(DEV_OWNER_ID, built.id);
    expect(detail.slots).toEqual([
      { id: built.slot.id, name: 'Client', email: '' },
    ]);
    expect(detail.prefills).toMatchObject([
      { fieldId: built.client.id, label: 'Client name', text: '' },
    ]);
  });

  it('cannot send a template', async () => {
    const built = await buildTemplate();
    await expect(
      publish({ ownerId: DEV_OWNER_ID, documentId: built.id }),
    ).rejects.toThrow(/template is not sent/);
  });

  it('makes a draft with new ids, the same PDF, and the answers filled in', async () => {
    const built = await buildTemplate();
    const { documentId } = await createFromTemplate({
      ownerId: DEV_OWNER_ID,
      use: {
        templateId: built.id,
        title: 'Acme agreement',
        signers: [
          {
            slotId: built.slot.id,
            name: 'Acme Ltd',
            email: 'Acme@Example.com',
          },
        ],
        prefills: [{ fieldId: built.client.id, text: ' Acme Ltd ' }],
      },
    });
    expect(documentId).not.toBe(built.id);
    const copy = await getDraft(documentId, DEV_OWNER_ID);
    expect(copy.document.kind).toBe('document');
    expect(copy.document.status).toBe('draft');
    expect(copy.document.title).toBe('Acme agreement');
    expect(copy.document.sourceSha256).toBe(await sha256Hex(built.bytes));
    expect(copy.signers).toHaveLength(1);
    expect(copy.signers[0]).toMatchObject({
      name: 'Acme Ltd',
      email: 'acme@example.com',
    });
    expect(copy.signers[0]?.id).not.toBe(built.slot.id);
    expect(copy.layout.fields).toHaveLength(2);
    for (const item of copy.layout.fields) {
      expect([built.signature.id, built.client.id]).not.toContain(item.id);
      expect(item.signerId).toBe(copy.signers[0]?.id);
    }
    const prefilled = copy.layout.fields.find(
      (item) => item.kind === 'prefilled_text',
    );
    expect(prefilled?.prefill).toBe('Acme Ltd');
    expect(prefilled?.label).toBe('Client name');
    const object = await env.STORAGE.get(copy.document.sourceR2Key ?? '');
    expect(
      new Uint8Array((await object?.arrayBuffer()) ?? new ArrayBuffer(0)),
    ).toEqual(built.bytes);

    const untouched = await readTemplate(DEV_OWNER_ID, built.id);
    expect(untouched.prefills[0]?.text).toBe('');
    const listed = await listOwnedDocuments(DEV_OWNER_ID);
    expect(listed.map((item) => item.id)).toContain(documentId);
  });

  it('will not send while a prefilled field is empty, then stamps the text when signed', async () => {
    const built = await buildTemplate();
    const { documentId } = await createFromTemplate({
      ownerId: DEV_OWNER_ID,
      use: {
        templateId: built.id,
        title: 'Beta agreement',
        signers: [
          { slotId: built.slot.id, name: 'Beta Co', email: 'beta@example.com' },
        ],
        prefills: [],
      },
    });
    await expect(
      publish({ ownerId: DEV_OWNER_ID, documentId, origin: ORIGIN }),
    ).rejects.toThrow(/prefilled text/);

    const draft = await getDraft(documentId, DEV_OWNER_ID);
    const fields = draft.layout.fields.map((item) =>
      item.kind === 'prefilled_text'
        ? { ...item, prefill: 'Beta Co, 1 Main Street' }
        : item,
    );
    await savePreparation({
      ownerId: DEV_OWNER_ID,
      documentId,
      layoutVersion: draft.document.layoutVersion,
      signers: draft.signers.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
      })),
      fields,
    });
    await publish({ ownerId: DEV_OWNER_ID, documentId, origin: ORIGIN });
    await publishOutbox({ documentId });
    await pump(sent);

    const exchanged = await exchangeSignerToken({
      token: tokenFor(mail.messages, 'beta@example.com'),
    });
    const view = await getSigningContext({ sessionId: exchanged.sessionId });
    if (view.kind !== 'ready') throw new Error(`Not ready: ${view.kind}`);
    // The signer sees the text the owner wrote, and has nothing to fill in for it.
    expect(
      view.fields.find((item) => item.kind === 'prefilled_text')?.prefill,
    ).toBe('Beta Co, 1 Main Street');
    expect(requiredFields(view.fields).map((item) => item.kind)).toEqual([
      'signature',
    ]);
    const signature = fields.find((item) => item.kind === 'signature');
    await submitSignature({
      sessionId: exchanged.sessionId,
      body: {
        idempotencyKey: crypto.randomUUID(),
        stateHash: view.stateHash,
        consent: true,
        values: [
          {
            fieldId: signature?.id ?? '',
            signature: { kind: 'typed', text: 'Beta Co', font: 'script-1' },
          },
        ],
      },
      ip: '203.0.113.9',
      userAgent: 'test',
      origin: ORIGIN,
    });
    const [done] = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(done?.status).toBe('completed');
    const envelope = JSON.parse(done?.manifestJson ?? '{}') as {
      manifest: {
        signers: { values: { fieldId: string; text?: string }[] }[];
      };
    };
    const stamped = envelope.manifest.signers[0]?.values.find(
      (value) => value.text === 'Beta Co, 1 Main Street',
    );
    const prefilledId = fields.find(
      (item) => item.kind === 'prefilled_text',
    )?.id;
    expect(stamped?.fieldId).toBe(prefilledId);
  });

  it('deletes a template and its PDF but leaves documents made from it', async () => {
    const built = await buildTemplate();
    const { documentId } = await createFromTemplate({
      ownerId: DEV_OWNER_ID,
      use: {
        templateId: built.id,
        title: 'Keep me',
        signers: [],
        prefills: [],
      },
    });
    const key = (await getDraft(built.id, DEV_OWNER_ID)).document.sourceR2Key;
    await deleteTemplate({ ownerId: DEV_OWNER_ID, templateId: built.id });
    expect((await listTemplates(DEV_OWNER_ID)).map((t) => t.id)).not.toContain(
      built.id,
    );
    expect(await env.STORAGE.get(key ?? '')).toBeNull();
    const rows = await getDb()
      .select()
      .from(signers)
      .where(eq(signers.documentId, built.id));
    expect(rows).toHaveLength(0);
    const copy = await getDraft(documentId, DEV_OWNER_ID);
    expect(
      await env.STORAGE.get(copy.document.sourceR2Key ?? ''),
    ).not.toBeNull();
  });

  it("another owner's templates are not found", async () => {
    const built = await buildTemplate();
    await expect(
      readTemplate('01HZOTHER00000000000000009', built.id),
    ).rejects.toThrow(/not found/);
    await expect(
      createFromTemplate({
        ownerId: '01HZOTHER00000000000000009',
        use: { templateId: built.id, title: 'x', signers: [], prefills: [] },
      }),
    ).rejects.toThrow(/not found/);
  });
});
