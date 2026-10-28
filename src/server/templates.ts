import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import { ulidSchema } from '#/core/contracts/index.ts';
import { resolveActor } from '#/server/actor.ts';
import {
  createFromTemplate,
  deleteTemplate,
  fromTemplateInputSchema,
  listTemplates,
  readTemplate,
} from '#/server/domain/templates.ts';
import { isAppError } from '#/server/errors.ts';

const templateIdSchema = z.strictObject({ templateId: ulidSchema });

export const listTemplatesFn = createServerFn({ method: 'GET' }).handler(
  async () => settle(async () => listTemplates((await resolveActor()).id)),
);

export const getTemplateFn = createServerFn({ method: 'GET' })
  .validator(templateIdSchema)
  .handler(async ({ data }) =>
    settle(async () =>
      readTemplate((await resolveActor()).id, data.templateId),
    ),
  );

export const createFromTemplateFn = createServerFn({ method: 'POST' })
  .validator(fromTemplateInputSchema)
  .handler(async ({ data }) =>
    settle(async () =>
      createFromTemplate({ ownerId: (await resolveActor()).id, use: data }),
    ),
  );

export const deleteTemplateFn = createServerFn({ method: 'POST' })
  .validator(templateIdSchema)
  .handler(async ({ data }) =>
    settle(async () =>
      deleteTemplate({
        ownerId: (await resolveActor()).id,
        templateId: data.templateId,
      }),
    ),
  );

async function settle<T>(
  run: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    if (isAppError(error)) return { error: error.message };
    throw error;
  }
}
