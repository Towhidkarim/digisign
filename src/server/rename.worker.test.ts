import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import { documents } from '#/db/schema/index.ts';
import { createDraft, renameDraft } from '#/server/domain/documents.ts';
import { DEV_OWNER_ID, migrate } from '#/server/test-support.ts';

beforeAll(migrate);

async function titleOf(id: string): Promise<string | undefined> {
  const [row] = await getDb()
    .select({ title: documents.title })
    .from(documents)
    .where(eq(documents.id, id));
  return row?.title;
}

describe('rename draft', () => {
  it('renames a draft and trims the name', async () => {
    const id = ulid();
    await createDraft({ id, title: 'scan_0042', ownerId: DEV_OWNER_ID });
    const result = await renameDraft({
      ownerId: DEV_OWNER_ID,
      documentId: id,
      title: '  Lease agreement  ',
    });
    expect(result).toEqual({ title: 'Lease agreement' });
    expect(await titleOf(id)).toBe('Lease agreement');
  });

  it('rejects an empty or overlong name and keeps the old one', async () => {
    const id = ulid();
    await createDraft({ id, title: 'Keep me', ownerId: DEV_OWNER_ID });
    for (const title of ['   ', 'x'.repeat(201)]) {
      await expect(
        renameDraft({ ownerId: DEV_OWNER_ID, documentId: id, title }),
      ).rejects.toThrow();
    }
    expect(await titleOf(id)).toBe('Keep me');
  });

  it("does not let another user rename someone else's draft", async () => {
    const id = ulid();
    await createDraft({ id, title: 'Mine', ownerId: DEV_OWNER_ID });
    await expect(
      renameDraft({ ownerId: 'someone-else', documentId: id, title: 'Theirs' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await titleOf(id)).toBe('Mine');
  });

  it('does not rename once the document is no longer a draft', async () => {
    const id = ulid();
    await createDraft({ id, title: 'Frozen', ownerId: DEV_OWNER_ID });
    await getDb()
      .update(documents)
      .set({ status: 'in_progress' })
      .where(eq(documents.id, id));
    await expect(
      renameDraft({ ownerId: DEV_OWNER_ID, documentId: id, title: 'Changed' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await titleOf(id)).toBe('Frozen');
  });
});
