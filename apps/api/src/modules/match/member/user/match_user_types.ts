import z from "zod";
import {
  $newMatchUser,
  $matchUser,
} from "@/modules/match/member/user/match_user_schemas";

export type NewMatchUser = z.infer<typeof $newMatchUser>;
export type MatchUser = z.infer<typeof $matchUser>;
