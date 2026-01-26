import { z } from "zod";

export const $championship = z.object({
  id: z.uuid(),
  version: z.number(),
  name: z.string().min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newChampionship = z.object({
  name: z.string().min(1).max(100),
});

export const $updateChampionship = $championship.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
});

export type Championship = z.infer<typeof $championship>;
export type NewChampionship = z.infer<typeof $newChampionship>;
export type UpdateChampionship = z.infer<typeof $updateChampionship>;
