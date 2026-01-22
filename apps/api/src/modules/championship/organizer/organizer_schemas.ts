import { z } from "zod";

export const $organizer = z.object({
  id: z.uuid(),
  championshipId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "organizer", "referee"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newOrganizer = z.object({
  championshipId: z.uuid(),
  userId: z.uuid(),
  role: z.enum(["owner", "organizer", "referee"]),
});

export type Organizer = z.infer<typeof $organizer>;
export type NewOrganizer = z.infer<typeof $newOrganizer>;
