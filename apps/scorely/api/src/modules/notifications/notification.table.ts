// Como a Notification é salva e buscada (single-table, sem GSI). O formato da entidade é o
// `NotificationSchema` de @scorely/contracts. Toda escrita grava a entidade, o lookup e o contador
// na mesma transação.
import type { Notification } from '@scorely/contracts';

export const NOTIFICATION_ENTITY = 'Notification';
export const INBOX_ENTITY = 'Inbox';

/**
 * Entidade: `PK=NOTIFICATION#<id>`, `SK=META`, com todos os atributos.
 * Leitura: GetItem.
 */
export function notificationKey(id: Notification['id']) {
  return { PK: `NOTIFICATION#${id}`, SK: 'META' };
}

/**
 * Lookup de listagem por usuário, do mais novo para o mais antigo:
 * `PK=LOOKUP#USER#NOTIFICATIONS#<userId>`, `SK=<createdAt>#<id>`, `{ id }`.
 * Leitura: Query em `notificationListLookupPk(userId)` (paginada) → BatchGet em `notificationKey(id)`.
 */
export function notificationListLookupPk(userId: Notification['userId']) {
  return `LOOKUP#USER#NOTIFICATIONS#${userId}`;
}

export function notificationListLookupKey(n: Pick<Notification, 'id' | 'userId' | 'createdAt'>) {
  return { PK: notificationListLookupPk(n.userId), SK: `${n.createdAt}#${n.id}` };
}

/**
 * Contador de não lidas do usuário: `PK=INBOX#<userId>`, `SK=META`, `{ unread }`.
 * Escrita: upsert com `ADD unread ±1`, na mesma transação da Notification.
 * Leitura: GetItem.
 */
export function inboxKey(userId: Notification['userId']) {
  return { PK: `INBOX#${userId}`, SK: 'META' };
}
