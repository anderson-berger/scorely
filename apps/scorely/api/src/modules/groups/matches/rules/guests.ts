// Convidados (PAR-11–14): pedir, liberar, recusar, cancelar e remover.
import { newEntity } from '@scorely/api/src/lib/entity';
import { appError } from '@scorely/api/src/lib/errors';
import type { UserId } from '@scorely/api/src/lib/ids';
import type {
  GuestTransition,
  StoredGuest,
  StoredMatch,
} from '@scorely/api/src/modules/groups/matches/data/matches.repository';
import type { MatchContext } from '@scorely/api/src/modules/groups/matches/matches.service';
import { currentWave, MANAGE, naturalTimes } from '@scorely/api/src/modules/groups/matches/rules/matches';
import {
  MATCH_GUEST_MAX,
  type Match,
  type MatchGuestStatus,
  type PublicGroupId,
  type RequestMatchGuestInput,
} from '@scorely/contracts';

/** PAR-12: sem maiúsculas, acentos e espaços repetidos, para comparar nomes. */
export function normalizeGuestName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** PAR-11: a situação do convidado, calculada dos campos de cada passo. */
export function guestStatus(guest: StoredGuest): MatchGuestStatus {
  if (guest.removedAt !== undefined) return 'removed';
  if (guest.approvedAt !== undefined) return 'approved';
  if (guest.declinedAt !== undefined) return 'declined';
  return 'pending';
}

/** PAR-12, 13: a onda de convidados aberta e a lista não fechada. */
function requireGuestWave(match: StoredMatch, at: Date): void {
  if (at >= naturalTimes(match).close) throw appError('MATCH_CLOSED');
  if (currentWave(match, at) !== 'guests') {
    const opensAt = naturalTimes(match).guests;
    throw appError('MATCH_NOT_OPEN_FOR_YOU', {
      ...(opensAt !== undefined && { opensAt: opensAt.toISOString() }),
    });
  }
}

function requirePending(guest: StoredGuest): void {
  const status = guestStatus(guest);
  if (status !== 'pending') throw appError('MATCH_GUEST_NOT_PENDING', { status });
}

export function guestsRules(ctx: MatchContext) {
  const { deps, now } = ctx;

  /** PAR-11, 12. */
  async function requestGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    input: RequestMatchGuestInput,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    ctx.requireLive(match);
    requireGuestWave(match, at);
    const manage = ctx.canManage(access);
    const iso = at.toISOString();
    const entity = newEntity<Omit<StoredGuest, 'updatedAt'>>(
      {
        groupId: access.groupId,
        matchId,
        name: input.name,
        normalizedName: normalizeGuestName(input.name),
        requestedBy: userId,
        version: 1,
        ...(manage && { approvedAt: iso, approvedBy: userId }),
      },
      at,
    );
    const guest: StoredGuest = { ...entity, updatedAt: entity.createdAt };
    const result = await deps.matches.requestGuest(guest, MATCH_GUEST_MAX);
    if (result === 'duplicate') throw appError('MATCH_GUEST_DUPLICATE');
    if (result === 'limit') throw appError('MATCH_GUEST_LIMIT', { limit: MATCH_GUEST_MAX });
    if (!manage) {
      const [admins, people] = await Promise.all([
        deps.groups.holders(access.groupId, MANAGE),
        ctx.profiles([userId]),
      ]);
      const who = people.get(userId)?.nickname ?? 'Alguém';
      await Promise.all(
        admins
          .filter((u) => u !== userId)
          .map((u) =>
            deps.notifications.notify(u, {
              type: 'match_guest_requested',
              title: 'Pedido de convidado',
              body: `${who} quer trazer ${input.name} para a partida de ${access.name}.`,
              link: ctx.linkOf(access, matchId),
            }),
          ),
      );
    }
    return ctx.view(access, userId, match, true);
  }

  async function loadGuest(match: StoredMatch, guestId: string): Promise<StoredGuest> {
    const guest = await deps.matches.getGuest(match.groupId, match.id, guestId, { consistent: true });
    if (!guest) throw appError('MATCH_GUEST_NOT_FOUND');
    return guest;
  }

  /** Grava o passo; outro chegou antes → `MATCH_GUEST_NOT_PENDING` com a situação atual (PAR-13, 14). */
  async function transition(
    match: StoredMatch,
    guest: StoredGuest,
    step: GuestTransition,
    by: UserId,
    at: Date,
  ): Promise<void> {
    const ok = await deps.matches.transitionGuest({ guest, transition: step, by, at });
    if (!ok) {
      const current = await loadGuest(match, guest.id);
      throw appError('MATCH_GUEST_NOT_PENDING', { status: guestStatus(current) });
    }
  }

  /** PAR-13: liberar. A posição é a da liberação (PAR-09). */
  async function approveGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    guestId: string,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    ctx.requireLive(match);
    const guest = await loadGuest(match, guestId);
    requirePending(guest);
    requireGuestWave(match, at);
    await transition(match, guest, 'approve', userId, at);
    return ctx.view(access, userId, match, true);
  }

  /** PAR-13: recusar, até o início, sem aviso. */
  async function declineGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    guestId: string,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    ctx.requireManage(access);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    ctx.requireLive(match);
    const guest = await loadGuest(match, guestId);
    requirePending(guest);
    await transition(match, guest, 'decline', userId, at);
    return ctx.view(access, userId, match, true);
  }

  /** PAR-14: o `pending` só quem pediu cancela; o `approved` quem pediu ou quem tem `matches.manage` remove. */
  async function removeGuest(
    userId: UserId,
    publicId: PublicGroupId,
    matchId: string,
    guestId: string,
  ): Promise<Match> {
    const access = await deps.groups.access(userId, publicId);
    const match = await ctx.load(access.groupId, matchId);
    const at = now();
    ctx.requireLive(match);
    const guest = await loadGuest(match, guestId);
    const status = guestStatus(guest);
    if (status !== 'pending' && status !== 'approved') throw appError('MATCH_GUEST_NOT_PENDING', { status });
    const mine = guest.requestedBy === userId;
    if (!(mine || (status === 'approved' && ctx.canManage(access)))) {
      throw appError('GROUP_PERMISSION_DENIED', { permission: MANAGE });
    }
    if (status === 'pending') {
      await transition(match, guest, 'cancel', userId, at);
      return ctx.view(access, userId, match, true);
    }
    const before = await ctx.stateOf(match, true);
    await transition(match, guest, 'remove', userId, at);
    const after = await ctx.stateOf(match, true);
    await ctx.notifyPromoted(access, match, before.list, after.list);
    return ctx.view(access, userId, match, true);
  }

  return { requestGuest, approveGuest, declineGuest, removeGuest };
}
