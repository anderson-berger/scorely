import { z } from "zod";

export const $matchUser = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  deletedAt: z.iso.datetime().optional(),

  userId: z.uuid(),
  matchId: z.uuid(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  status: z.enum(["INVITED", "CONFIRMED", "DECLINED", "LEFT"]),
});

export const $newMatchUser = $matchUser.omit({
  id: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export const $addMatchMemberBody = $matchUser.pick({ userId: true });

export const $updateMatchMemberRoleBody = $matchUser.pick({ role: true });
