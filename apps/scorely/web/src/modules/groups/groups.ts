import type { Member, MyGroup } from '@scorely/contracts';
import { ApiRequestError } from '@scorely/web/src/lib/http';

/** Separa os grupos em "Sou dono" e "Participo", mantendo a ordem da api (plano 013, D4). */
export function splitGroups<T extends Pick<MyGroup, 'ownerId'>>(
  groups: T[],
  userId: string | undefined,
): { owned: T[]; joined: T[] } {
  const isMine = (g: T) => userId !== undefined && g.ownerId === userId;
  return { owned: groups.filter(isMine), joined: groups.filter((g) => !isMine(g)) };
}

/** Aba da tela de Grupos, pela query `?tab=` (plano 014, D1). Valor desconhecido cai em `next`; `archived` sem arquivados também (GRP-27). */
export type GroupsTab = 'next' | 'owned' | 'joined' | 'archived';

export function groupsTab(query: Record<string, unknown>, hasArchived: boolean): GroupsTab {
  const tab = query.tab;
  if (tab === 'archived') return hasArchived ? 'archived' : 'next';
  return tab === 'owned' || tab === 'joined' ? tab : 'next';
}

/** Do jogo mais próximo ao mais distante, cancelados no fim; empate mantém a ordem (D2). Não altera a entrada. */
export function sortByNextGame<T extends { game: Pick<MyGroup['game'], 'startsAt' | 'status'> }>(
  groups: T[],
): T[] {
  const rank = (g: T) => (g.game.status === 'cancelled' ? 1 : 0);
  return groups
    .map((g, i) => ({ g, i }))
    .sort(
      (a, b) =>
        rank(a.g) - rank(b.g) || Date.parse(a.g.game.startsAt) - Date.parse(b.g.game.startsAt) || a.i - b.i,
    )
    .map(({ g }) => g);
}

/** A frase do card (D4). */
export type CardLine =
  | { kind: 'archived'; at: string }
  | { kind: 'cancelled' }
  | { kind: 'in_progress' }
  | { kind: 'playing'; position: number }
  | { kind: 'waiting'; position: number }
  | { kind: 'opens'; at: string }
  | { kind: 'spots'; count: number }
  | { kind: 'full' }
  /** GRP-28 com o mínimo (GRP-46): quantos faltam para o jogo acontecer, ou o jogo já confirmado. */
  | { kind: 'needs'; count: number }
  | { kind: 'confirmed' };

const HOUR_MS = 3_600_000;

export function cardLine(
  group: Pick<MyGroup, 'myRole' | 'listOpensHoursBefore' | 'reservesOpenHoursBefore'> & {
    game?: MyGroup['game'] | undefined;
    archivedAt?: string | undefined;
  },
  now: Date,
): CardLine {
  // GRP-28: arquivado vem antes de tudo, e não tem jogo.
  if (group.archivedAt) return { kind: 'archived', at: group.archivedAt };
  const { game } = group;
  if (!game) throw new Error('cardLine: active group without game');
  if (game.status === 'cancelled') return { kind: 'cancelled' };
  if (game.status === 'in_progress') return { kind: 'in_progress' };
  if (game.me?.list === 'confirmed') return { kind: 'playing', position: game.me.position };
  if (game.me?.list === 'waitlist') return { kind: 'waiting', position: game.me.position };
  const hours = group.myRole === 'reserve' ? group.reservesOpenHoursBefore : group.listOpensHoursBefore;
  const opensAt = Date.parse(game.startsAt) - hours * HOUR_MS;
  if (now.getTime() < opensAt) return { kind: 'opens', at: new Date(opensAt).toISOString() };
  const left = game.slots - game.confirmedCount;
  if (left <= 0) return { kind: 'full' };
  if (game.minPlayers === undefined) return { kind: 'spots', count: left };
  const missing = game.minPlayers - game.confirmedCount;
  return missing > 0 ? { kind: 'needs', count: missing } : { kind: 'confirmed' };
}

/** Cor fixa do grupo (1–6) a partir do id, até existir logo e capa (D5). */
export function groupColor(id: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const hash = [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return ((hash % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
}

/** Membros (dono primeiro) e reservas, na ordem da api (plano 015, D11). Não altera a entrada. */
export function memberSections<T extends Pick<Member, 'isOwner' | 'role'>>(
  members: T[],
): { members: T[]; reserves: T[] } {
  const owner = members.filter((m) => m.isOwner);
  const rest = members.filter((m) => !m.isOwner);
  return {
    members: [...owner, ...rest.filter((m) => m.role !== 'reserve')],
    reserves: rest.filter((m) => m.role === 'reserve'),
  };
}

/** GRP-37: o jogo atual de um grupo arquivado é "sem jogo" (a api responde `GROUP_ARCHIVED`); outro erro sobe igual. */
export async function gameUnlessArchived<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof ApiRequestError && err.code === 'GROUP_ARCHIVED') return null;
    throw err;
  }
}
