import { z } from "zod";

export const $team = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newTeam = z.object({
  name: z.string().min(1).max(100),
});

export type Team = z.infer<typeof $team>;
export type NewTeam = z.infer<typeof $newTeam>;
