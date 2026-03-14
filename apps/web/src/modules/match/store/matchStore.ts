import { reactive } from 'vue';
import matchService from 'src/modules/match/services/matchService';
import type { Match, NewMatch } from '@scorely/api/modules/match/match_types';
import type { MatchUser } from '@scorely/api/modules/match/member/user/match_user_types';

interface MatchStoreState {
  matches: Match[];
  currentMatch: Match | null;
  currentMember: MatchUser | null;
  members: MatchUser[];
  hasMore: boolean;
  nextCursor: string | undefined;
  loading: boolean;
  error: string | null;
}

class MatchStore {
  private _state = reactive<MatchStoreState>({
    matches: [],
    currentMatch: null,
    currentMember: null,
    members: [],
    hasMore: false,
    nextCursor: undefined,
    loading: false,
    error: null,
  });

  get matches() {
    return this._state.matches;
  }

  get currentMatch() {
    return this._state.currentMatch;
  }

  get currentMember() {
    return this._state.currentMember;
  }

  get members() {
    return this._state.members;
  }

  get hasMore() {
    return this._state.hasMore;
  }

  get nextCursor() {
    return this._state.nextCursor;
  }

  get loading() {
    return this._state.loading;
  }

  get error() {
    return this._state.error;
  }

  get activeMatches() {
    return this._state.matches.filter((m) =>
      ['OPEN', 'FULL', 'IN_PROGRESS'].includes(m.status),
    );
  }

  get isOwner() {
    return this._state.currentMember?.role === 'OWNER';
  }

  async fetchMyMatches(reset = false) {
    if (reset) {
      this._state.matches = [];
      this._state.nextCursor = undefined;
    }

    this._state.loading = true;
    this._state.error = null;

    try {
      const result = await matchService.getMyMatches(this._state.nextCursor);
      this._state.matches = reset
        ? result.items
        : [...this._state.matches, ...result.items];
      this._state.hasMore = result.hasMore;
      this._state.nextCursor = result.nextCursor;
    } catch (e: unknown) {
      this._state.error = (e as Error).message;
    } finally {
      this._state.loading = false;
    }
  }

  async fetchMatch(id: Match['id']) {
    this._state.loading = true;
    this._state.error = null;

    try {
      const result = await matchService.getById(id);
      this._state.currentMatch = result.match;
      this._state.currentMember = result.member;
    } catch (e: unknown) {
      this._state.error = (e as Error).message;
    } finally {
      this._state.loading = false;
    }
  }

  async createMatch(input: NewMatch): Promise<Match> {
    this._state.loading = true;
    this._state.error = null;

    try {
      const result = await matchService.create(input);
      this._state.matches.unshift(result.match);
      return result.match;
    } catch (e: unknown) {
      this._state.error = (e as Error).message;
      throw e;
    } finally {
      this._state.loading = false;
    }
  }

  async deleteMatch(id: Match['id']) {
    await matchService.remove(id);
    this._state.matches = this._state.matches.filter((m) => m.id !== id);
    if (this._state.currentMatch?.id === id) this._state.currentMatch = null;
  }

  async fetchMembers(matchId: Match['id']) {
    const result = await matchService.getMembers(matchId);
    this._state.members = result.items;
  }

  reset() {
    this._state.matches = [];
    this._state.currentMatch = null;
    this._state.currentMember = null;
    this._state.members = [];
    this._state.hasMore = false;
    this._state.nextCursor = undefined;
    this._state.loading = false;
    this._state.error = null;
  }
}

export const matchStore = new MatchStore();
