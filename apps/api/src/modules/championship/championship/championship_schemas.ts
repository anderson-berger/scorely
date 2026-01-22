import { z } from "zod";

export const $championship = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(100),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newChampionship = z.object({
  name: z.string().min(1).max(100),
});

export type Championship = z.infer<typeof $championship>;
export type NewChampionship = z.infer<typeof $newChampionship>;
