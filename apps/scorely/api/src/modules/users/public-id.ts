import { randomInt } from 'node:crypto';
import { PUBLIC_USER_ID_ALPHABET, PUBLIC_USER_ID_LENGTH, type PublicUserId } from '@scorely/contracts';

/** USR-15: código de amigo com 8 caracteres sorteados (uniforme) do alfabeto Crockford base32. */
export function newPublicId(random: (max: number) => number = randomInt): PublicUserId {
  return Array.from(
    { length: PUBLIC_USER_ID_LENGTH },
    () => PUBLIC_USER_ID_ALPHABET[random(PUBLIC_USER_ID_ALPHABET.length)],
  ).join('') as PublicUserId;
}
