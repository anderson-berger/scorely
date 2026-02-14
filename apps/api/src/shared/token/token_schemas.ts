import z from "zod";

export const $accessTokenSubject = z.object({
  userId: z.uuid(),
});

export type AccessTokenSubject = z.infer<typeof $accessTokenSubject>;
