import { z } from "zod";

export const $file = z.object({
  id: z.uuid(),
  version: z.number(),

  // dados do arquivo
  filename: z.string().min(1),
  contentType: z.string(), // image/png, image/jpeg
  size: z.number(), // bytes

  // onde está armazenado
  bucket: z.string(),
  key: z.string(), // path no S3 (ex: users/avatars/uuid.png)
  url: z.url(), // url pública ou cloudfront

  // contexto (quem usa essa filem)
  ownerType: z.enum(["USER", "TEAM", "ORG"]).nullable(),
  ownerId: z.uuid().nullable(),

  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const $newFile = z.object({
  filename: z.string().min(1),
  contentType: z.string(),
  size: z.number(),

  ownerType: z.enum(["USER", "TEAM", "ORG"]).nullable(),
  ownerId: z.uuid().nullable(),
});

export const $updateFile = $file.omit({
  id: true,
  version: true,
  bucket: true,
  key: true,
  createdAt: true,
  updatedAt: true,
});

export type File = z.infer<typeof $file>;
export type NewFile = z.infer<typeof $newFile>;
export type UpdateFile = z.infer<typeof $updateFile>;
