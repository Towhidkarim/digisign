import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { signatureInputSchema } from '#/core/contracts/index.ts';

/**
 * The signed-in user's kept signature. Signers who come in from a link and are not signed in
 * get `signedIn: false` and keep theirs in the browser instead.
 */
export const getSavedSignatureFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { readActor } = await import('#/server/actor.ts');
    const { readSavedSignature } = await import(
      '#/server/domain/saved-signature.ts'
    );
    const actor = await readActor();
    if (!actor) return { signedIn: false as const, signature: null };
    return {
      signedIn: true as const,
      signature: await readSavedSignature(actor.id),
    };
  },
);

export const saveSignatureFn = createServerFn({ method: 'POST' })
  .validator(z.strictObject({ signature: signatureInputSchema }))
  .handler(async ({ data }) => {
    const { readActor } = await import('#/server/actor.ts');
    const { writeSavedSignature } = await import(
      '#/server/domain/saved-signature.ts'
    );
    const actor = await readActor();
    if (!actor) return { saved: false as const };
    await writeSavedSignature({ userId: actor.id, signature: data.signature });
    return { saved: true as const };
  });

export const forgetSavedSignatureFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { readActor } = await import('#/server/actor.ts');
  const { deleteSavedSignature } = await import(
    '#/server/domain/saved-signature.ts'
  );
  const actor = await readActor();
  if (actor) await deleteSavedSignature(actor.id);
  return { signedIn: actor !== null };
});
