// Como a mídia é salva (single-table, sem GSI). Tipo interno da api: as respostas são o `MediaUpload` e a URL
// que cada área guarda no próprio item (docs/modules/midia.md).

import type { MediaTarget } from '@scorely/api/src/modules/media/media.access';
import type { ImageContentType, MediaKind, MediaOwnerType, MediaPurpose } from '@scorely/contracts';

export const MEDIA_ENTITY = 'Media';

/** A mídia como fica no banco (MID-04, MID-06). */
export interface MediaRecord {
  id: string;
  createdAt: string;
  kind: MediaKind;
  purpose: MediaPurpose;
  ownerType: MediaOwnerType;
  ownerId: string;
  status: 'pending' | 'ready';
  /** `tmp/<id>` na pendente; `public/<purpose>/<id>` na pronta (MID-12). */
  key: string;
  uploadedBy: string;
  contentType?: ImageContentType;
  size?: number;
  width?: number;
  height?: number;
  /** Só na pendente: criação + 1 h (MID-04), com `ttl` no banco (ADR 0004). */
  expiresAt?: string;
}

/**
 * Entidade: `PK=MEDIA#<id>`, `SK=META`. Leitura: GetItem consistente.
 * Escrita: Put da pendente (com `ttl`); na confirmação, Update que troca a pendente pela pronta (sem `ttl`, a
 * `version` segue, ADR 0013) com a condição de ainda estar pendente, na mesma transação do Update da área e do Delete
 * da anterior.
 */
export function mediaKey(id: string) {
  return { PK: `MEDIA#${id}`, SK: 'META' };
}

/** Nome do campo que a área guarda. */
export function targetFields(field: MediaTarget['field']) {
  return { id: `${field}MediaId` };
}
