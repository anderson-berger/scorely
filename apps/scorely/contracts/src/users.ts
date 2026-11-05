import { z } from 'zod';
import { EntitySchema } from './entity';

/** Usado no sorteio misto e (depois) no MVP. */
export const GenderSchema = z.enum(['M', 'F']);
export type Gender = z.infer<typeof GenderSchema>;

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Invalid email' }));

export const UserSchema = EntitySchema.extend({
  email: z.email(),
  name: z.string().min(1).max(80).optional(),
  nickname: z.string().min(1).max(40).optional(),
  gender: GenderSchema.optional(),
});
export type User = z.infer<typeof UserSchema>;

/** PATCH /me. `nickname: null` remove o apelido. */
export const UpdateMeInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    nickname: z.string().trim().min(1).max(40).nullable(),
    gender: GenderSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateMeInput = z.infer<typeof UpdateMeInputSchema>;
