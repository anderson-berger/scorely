/**
 * Bucket de uploads (módulo de mídia, docs/modules/midia.md). Na AWS o nome leva o AccountId (nome de
 * bucket é global), montado no stack de infra; no dev local é só `<projeto>-<stage>-uploads` (setup-local.ts).
 */
export const uploadsBucketFor = (project: string, stage: string) => `${project}-${stage}-uploads`;

/**
 * Prefixos do bucket (MID-12, MID-13): `public/` tem leitura pública; `tmp/` guarda o envio ainda não
 * confirmado e expira sozinho; `private/` fica reservado para mídia com acesso restrito.
 */
export const MEDIA_PREFIXES = { public: 'public/', tmp: 'tmp/', private: 'private/' } as const;

/** Dias até o S3 apagar um envio nunca confirmado em `tmp/` (MID-13). */
export const TMP_EXPIRATION_DAYS = 1;
