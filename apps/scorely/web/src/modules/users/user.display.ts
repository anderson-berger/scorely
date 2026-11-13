import type { Me } from '@scorely/contracts';

/** Nome mostrado nas listas: apelido, se houver. */
export const displayName = (u: Pick<Me, 'name' | 'nickname' | 'email'>) => u.nickname ?? u.name ?? u.email;
