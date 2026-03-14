import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { matchStore } from 'src/modules/match/store/matchStore';
import type { Match, NewMatch } from '@scorely/api/modules/match/match_types';

export function useMatch() {
  const router = useRouter();

  async function loadMyMatches(reset = true) {
    await matchStore.fetchMyMatches(reset);
  }

  async function loadMore() {
    if (matchStore.hasMore && !matchStore.loading) {
      await matchStore.fetchMyMatches(false);
    }
  }

  async function loadMatch(id: Match['id']) {
    await matchStore.fetchMatch(id);
  }

  async function createAndNavigate(input: NewMatch) {
    const match = await matchStore.createMatch(input);
    await router.push({ name: 'app.match.detail', params: { id: match.id } });
  }

  async function deleteAndNavigate(id: Match['id']) {
    await matchStore.deleteMatch(id);
    await router.push({ name: 'app.matches' });
  }

  return {
    matches: computed(() => matchStore.matches),
    currentMatch: computed(() => matchStore.currentMatch),
    currentMember: computed(() => matchStore.currentMember),
    members: computed(() => matchStore.members),
    hasMore: computed(() => matchStore.hasMore),
    loading: computed(() => matchStore.loading),
    error: computed(() => matchStore.error),
    isOwner: computed(() => matchStore.isOwner),
    loadMyMatches,
    loadMore,
    loadMatch,
    createAndNavigate,
    deleteAndNavigate,
    fetchMembers: (id: Match['id']) => matchStore.fetchMembers(id),
  };
}
