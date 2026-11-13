import type { PublicUserId } from '@scorely/contracts';

/**
 * Id do sistema da pessoa (uuid). Fica no token, no banco e dentro da api; nunca sai numa resposta (USR-16).
 * O branded type impede trocar sem querer pelo id público (`PublicUserId`, de @scorely/contracts).
 */
export type UserId = string & { readonly __brand: 'UserId' };

/** Só para quem lê o id do banco ou do JWT (e para os testes). */
export function asUserId(id: string): UserId {
  return id as UserId;
}

/**
 * Id público vindo da rota (`{userId}`). Não valida o formato de propósito (USR-17): código malformado ou o id
 * do sistema no lugar dele só não é achado pelo `resolve`, e a resposta é a mesma de uma pessoa fora do grupo.
 */
export function asPublicUserId(raw: string): PublicUserId {
  return raw as PublicUserId;
}
