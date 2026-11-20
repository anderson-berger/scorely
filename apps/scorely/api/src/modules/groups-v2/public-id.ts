import { randomInt } from 'node:crypto';
import { PUBLIC_GROUP_ID_LENGTH, PUBLIC_USER_ID_ALPHABET, type PublicGroupId } from '@scorely/contracts';

/** GRV-08: código do grupo com 8 caracteres sorteados (uniforme) do alfabeto Crockford base32 (o do usuário). */
export function newPublicGroupId(random: (max: number) => number = randomInt): PublicGroupId {
  return Array.from(
    { length: PUBLIC_GROUP_ID_LENGTH },
    () => PUBLIC_USER_ID_ALPHABET[random(PUBLIC_USER_ID_ALPHABET.length)],
  ).join('') as PublicGroupId;
}
