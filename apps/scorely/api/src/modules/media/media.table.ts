// Como a mídia é salva (single-table, sem GSI). Tipo interno da api: as respostas são o `MediaUpload` e a URL
// que cada área guarda no próprio item (docs/modules/midia.md).
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
  /** Quem aparece no caminho público (MID-12): o id do grupo ou o id público da pessoa. Sem ele, o `ownerId`. */
  ownerRef?: string;
  status: 'pending' | 'ready';
  /** `tmp/<id>` na pendente; `public/<ownerType>/<ownerRef>/<purpose>/<id>.<ext>` na pronta. */
  key: string;
  uploadedBy: string;
  contentType?: ImageContentType;
  size?: number;
  width?: number;
  height?: number;
  /** Só na pendente: criação + 1 h (MID-04), com `ttl` no banco (ADR 0004). */
  expiresAt?: string;
}

/** Onde a área guarda a mídia: `<field>MediaId` e `<field>Url` no item `key` (MID-08). */
export interface MediaTarget {
  key: { PK: string; SK: string };
  field: 'avatar' | 'logo' | 'cover';
  /** Id ligado agora na área (leitura consistente); relido a cada tentativa. */
  readCurrent(): Promise<string | undefined>;
}

/**
 * Entidade: `PK=MEDIA#<id>`, `SK=META`. Leitura: GetItem consistente.
 * Escrita: Put da pendente (com `ttl`); na confirmação, Put da pronta (sem `ttl`) com a condição de ainda
 * estar pendente, na mesma transação do Update da área e do Delete da anterior.
 */
export function mediaKey(id: string) {
  return { PK: `MEDIA#${id}`, SK: 'META' };
}

/** Nomes dos dois campos que a área guarda. */
export function targetFields(field: MediaTarget['field']) {
  return { id: `${field}MediaId`, url: `${field}Url` };
}
