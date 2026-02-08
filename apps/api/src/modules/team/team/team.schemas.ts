import { z } from "zod";
import { $member } from "@/modules/team/member/member.schemas";

export const $baseEntity = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $attributesTeam = z
  .object({
    name: z.string().min(3).max(50),
    logo: z.string().min(1),
  })
  .partial();

export const $team = $baseEntity.extend($attributesTeam.shape);

export const $newTeam = $attributesTeam;

export const $teamWithMember = $team.extend({
  member: $member,
});
export type Team = z.infer<typeof $team>;
export type NewTeam = z.infer<typeof $newTeam>;
export type TeamWithMember = z.infer<typeof $teamWithMember>;
