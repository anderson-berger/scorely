import z from "zod";
import { $user } from "@/modules/user/user_schemas";

export type User = z.infer<typeof $user>;
