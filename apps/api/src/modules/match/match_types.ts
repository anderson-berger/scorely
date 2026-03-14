import z from "zod";
import { $match, $newMatch } from "./match_schemas";

export type Match = z.infer<typeof $match>;
export type NewMatch = z.infer<typeof $newMatch>;
