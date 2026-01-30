import { z } from "zod";

export const $baseEntity = z.object({
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $repositoryConfig = z.object({
  entityName: z.string(),
  sk: z.string(),
  gsiPK: z.string().nullable(),
});

export type BaseEntity = z.infer<typeof $baseEntity>;
export type RepositoryConfig = z.infer<typeof $repositoryConfig>;
