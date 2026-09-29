import { apiErrorSchema } from '@zap-runner/shared';
import type { Response } from 'supertest';
import { z } from 'zod';

const zapResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  webhook: z.object({ hookId: z.number(), repository: z.string() }).nullable(),
});

export function zapFrom(response: Response): z.infer<typeof zapResponseSchema> {
  return zapResponseSchema.parse(response.body);
}

export function zapsFrom(response: Response): z.infer<typeof zapResponseSchema>[] {
  return z.array(zapResponseSchema).parse(response.body);
}

export function errorFrom(response: Response): z.infer<typeof apiErrorSchema>['error'] {
  return apiErrorSchema.parse(response.body).error;
}
