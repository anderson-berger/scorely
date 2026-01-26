import { z } from "zod";

export const $team = z.object({
  id: z.uuid(),
  version: z.number(),
  name: z.string().min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newTeam = z.object({
  name: z.string().min(1).max(100),
});

export const $updateTeam = $team.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export type Team = z.infer<typeof $team>;
export type NewTeam = z.infer<typeof $newTeam>;
export type UpdateTeam = z.infer<typeof $updateTeam>;
