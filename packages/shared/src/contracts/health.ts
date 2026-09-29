import { z } from 'zod';

export const readinessSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  checks: z.object({
    database: z.boolean(),
    accepting: z.boolean(),
  }),
});

export type Readiness = z.infer<typeof readinessSchema>;
