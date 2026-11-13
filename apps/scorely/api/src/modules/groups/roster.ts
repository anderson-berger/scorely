// O que os grupos entregam a outros módulos (os times): as mesmas listas da resposta, mas com os dois ids de cada
// pessoa. Dentro da api tudo anda com o id do sistema; o público só sai na resposta (USR-16).
import type { UserId } from '@scorely/api/src/lib/ids';
import type { Attendee, Game, GuestGame, Member, PublicUserId } from '@scorely/contracts';

export type RosterMember = Omit<Member, 'userId'> & { userId: UserId; publicId: PublicUserId };
export type RosterAttendee = Omit<Attendee, 'userId'> & { userId: UserId; publicId: PublicUserId };
export type RosterGame = Omit<Game, 'confirmed' | 'waitlist'> & {
  confirmed: RosterAttendee[];
  waitlist: RosterAttendee[];
};
export type GuestRoster = Omit<GuestGame, 'game'> & { game: RosterGame };

/** Troca o id do sistema pelo público (a pessoa que sai na resposta). */
function toPublic<T extends { userId: UserId; publicId: PublicUserId }>({
  userId: _id,
  publicId,
  ...rest
}: T): Omit<T, 'userId' | 'publicId'> & { userId: PublicUserId } {
  return { ...rest, userId: publicId };
}

export function publicMember(member: RosterMember): Member {
  return toPublic(member);
}

export function publicGame(game: RosterGame): Game {
  return { ...game, confirmed: game.confirmed.map(toPublic), waitlist: game.waitlist.map(toPublic) };
}

export function publicGuestGame(guest: GuestRoster): GuestGame {
  return { ...guest, game: publicGame(guest.game) };
}
