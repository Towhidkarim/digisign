import { eq } from 'drizzle-orm';

import {
  type SignatureInput,
  signatureInputSchema,
} from '#/core/contracts/index.ts';
import { getDb } from '#/db/index.ts';
import { savedSignatures } from '#/db/schema/index.ts';

/** The signature a user chose to keep, or null. A row that no longer validates counts as none. */
export async function readSavedSignature(
  userId: string,
): Promise<SignatureInput | null> {
  const [row] = await getDb()
    .select({ signatureJson: savedSignatures.signatureJson })
    .from(savedSignatures)
    .where(eq(savedSignatures.userId, userId))
    .limit(1);
  if (!row) return null;
  try {
    const parsed = signatureInputSchema.safeParse(
      JSON.parse(row.signatureJson),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Keeps one signature per user, replacing the one before. */
export async function writeSavedSignature(input: {
  userId: string;
  signature: SignatureInput;
  now?: number;
}): Promise<void> {
  const signatureJson = JSON.stringify(input.signature);
  const updatedAt = input.now ?? Date.now();
  await getDb()
    .insert(savedSignatures)
    .values({ userId: input.userId, signatureJson, updatedAt })
    .onConflictDoUpdate({
      target: savedSignatures.userId,
      set: { signatureJson, updatedAt },
    });
}

export async function deleteSavedSignature(userId: string): Promise<void> {
  await getDb()
    .delete(savedSignatures)
    .where(eq(savedSignatures.userId, userId));
}
