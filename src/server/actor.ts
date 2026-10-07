import { eq } from 'drizzle-orm';

import { getDb } from '#/db/index.ts';
import { user } from '#/db/schema/index.ts';
import { AppError } from '#/server/errors.ts';

export type Actor = { id: string; role: 'owner'; email: string; name: string };

/** The signed-in creator, from the session cookie. Throws 401 when there is none. */
export async function resolveActor(headers?: Headers): Promise<Actor> {
  const found = await readActor(headers);
  if (!found) throw new AppError(401, 'Sign in to continue.');
  return found;
}

export async function readActor(headers?: Headers): Promise<Actor | null> {
  const { getAuth } = await import('#/lib/auth.ts');
  const requestHeaders = headers ?? (await currentHeaders());
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    role: 'owner',
    email: session.user.email,
    name: session.user.name,
  };
}

async function currentHeaders(): Promise<Headers> {
  const { getRequestHeaders } = await import('@tanstack/react-start/server');
  return getRequestHeaders();
}

/** Where to send the owner's notices. */
export async function ownerContact(
  ownerId: string,
): Promise<{ email: string; name: string } | null> {
  const [row] = await getDb()
    .select({ email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1);
  return row ?? null;
}
