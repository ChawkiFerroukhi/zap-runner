import { z } from 'zod';

export const sessionUserSchema = z.object({
  id: z.string(),
  login: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.url(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
