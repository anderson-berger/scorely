import { z } from "zod";

export const $match = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),

  sport: z.enum(["FOOTBALL", "FUTSAL", "SOCIETY", "BASKETBALL", "VOLLEYBALL"]),
  createdBy: z.uuid(),
  date: z.iso.datetime(),
  locationId: z.uuid().optional(),
  maxPlayers: z.number().int().positive(),
  status: z.enum(["OPEN", "FULL", "IN_PROGRESS", "FINISHED", "CANCELLED"]),
  visibility: z.enum(["PUBLIC", "PRIVATE"]),

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().optional(),
});

export const $newMatch = $match.omit({
  id: true,
  version: true,
  createdBy: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});
