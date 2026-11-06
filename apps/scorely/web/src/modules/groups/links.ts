import type { Game, GuestGame, InviteKind } from '@scorely/contracts';

/** Link de cada tipo (plano 007, D5/D7): membro e reserva entram por `/join`; convidado, pelo link do jogo. */
export function inviteUrl(origin: string, kind: InviteKind, token: string): string {
  const path = kind === 'guest' ? 'play' : 'join';
  return `${origin}/${path}/${encodeURIComponent(token)}`;
}

/** Quem é do grupo e abre o link do jogo vai para a página do grupo; o convidado fica. */
export function playRedirect(view: GuestGame): { name: 'group'; params: { id: string } } | undefined {
  return view.myRole === 'guest' ? undefined : { name: 'group', params: { id: view.group.id } };
}

export type ListGate = { kind: 'can_change' } | { kind: 'opens_at'; at: string } | { kind: 'closed' };

/** Se quem vê pode confirmar/desistir agora, quando poderá, ou se a lista está fechada para ele (D8). */
export function listGate(game: Game, now: Date): ListGate {
  if (game.status === 'in_progress' || game.status === 'cancelled' || !game.myOpensAt)
    return { kind: 'closed' };
  if (now.getTime() < new Date(game.myOpensAt).getTime()) return { kind: 'opens_at', at: game.myOpensAt };
  return { kind: 'can_change' };
}
