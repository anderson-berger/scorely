import { z } from "zod";

export const $baseEntity = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $memberRole = z
  .enum(["owner", "admin", "member"])
  .default("member");

export const $attributesMember = z
  .object({
    role: $memberRole,
    joinedAt: z.iso.datetime(),
  })
  .partial();

export const $member = $baseEntity
  .extend({
    teamId: z.uuid(),
    userId: z.uuid(),
  })
  .extend($attributesMember.shape);

export const $newMember = z.object({
  teamId: z.uuid(),
  userId: z.uuid(),
  role: $memberRole.default("member"),
});

export type MemberRole = z.infer<typeof $memberRole>;
export type NewMember = z.infer<typeof $newMember>;
export type Member = z.infer<typeof $member>;
