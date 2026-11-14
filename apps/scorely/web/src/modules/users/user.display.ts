import type { Me } from '@scorely/contracts';

/** Nome mostrado: sempre o apelido (USR-04). */
export const displayName = (u: Pick<Me, 'nickname'>) => u.nickname;
