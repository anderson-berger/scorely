import { z } from "zod";

export const $participant = z.object({
  id: z.uuid(),
  version: z.number(),
  championshipId: z.uuid(),
  teamId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newParticipant = z.object({
  championshipId: z.uuid(),
  teamId: z.uuid(),
});

export type Participant = z.infer<typeof $participant>;
export type NewParticipant = z.infer<typeof $newParticipant>;
