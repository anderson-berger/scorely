import type { User } from '@scorely/contracts';

/** Nome mostrado nas listas: apelido, se houver. */
export const displayName = (u: Pick<User, 'name' | 'nickname' | 'email'>) => u.nickname ?? u.name ?? u.email;
