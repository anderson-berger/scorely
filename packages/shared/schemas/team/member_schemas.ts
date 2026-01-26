import { z } from "zod";

export const $member = z.object({
  id: z.uuid(),
  version: z.number(),
  teamId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "admin", "member"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newMember = z.object({
  teamId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "admin", "member"]),
});

export type Member = z.infer<typeof $member>;
export type NewMember = z.infer<typeof $newMember>;
