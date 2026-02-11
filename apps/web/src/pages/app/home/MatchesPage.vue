<template>
  <q-page class="matches-page q-pa-lg">
    <div class="matches-header">
      <h5 class="text-white q-my-none">Partidas</h5>
      <q-btn color="primary" icon="add" label="Nova Partida" no-caps unelevated />
    </div>

    <MatchFilters class="q-mt-md" @update:filters="onFiltersUpdate" />

    <div class="matches-grid q-mt-lg">
      <MatchCard v-for="match in filteredMatches" :key="match.id" :match="match" />
    </div>

    <div v-if="filteredMatches.length === 0" class="empty-state text-center q-mt-xl">
      <q-icon name="sports_soccer" size="64px" color="grey-7" />
      <p class="text-grey-5 q-mt-md">Nenhuma partida encontrada</p>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import MatchCard from 'src/pages/app/home/matches-page/MatchCard.vue';
import MatchFilters from 'src/pages/app/home/matches-page/MatchFilters.vue';
import type { Match } from 'src/pages/app/home/matches-page/MatchCard.vue';
import type { MatchFilterState } from 'src/pages/app/home/matches-page/MatchFilters.vue';

export default defineComponent({
  name: 'MatchesPage',

  components: { MatchCard, MatchFilters },

  data() {
    return {
      filters: {
        status: [],
        role: [],
        sport: [],
        period: 'all',
      } as MatchFilterState,
      matches: [
        {
          id: '1',
          sport: 'futsal',
          status: 'in_progress',
          role: 'member',
          date: '10 Fev 2026 · 19:00',
          location: 'Arena Central',
          admin: 'João Silva',
          teamA: { name: 'Falcões FC' },
          teamB: { name: 'Lobos SC' },
          scoreA: 2,
          scoreB: 1,
        },
        {
          id: '2',
          sport: 'volleyball',
          status: 'scheduled',
          role: 'creator',
          date: '15 Fev 2026 · 20:30',
          location: 'Quadra Municipal',
          admin: 'Você',
          teamA: { name: 'Tubarões' },
          teamB: { name: 'Águias FC' },
          scoreA: 0,
          scoreB: 0,
        },
        {
          id: '3',
          sport: 'basketball',
          status: 'finished',
          role: 'member',
          date: '05 Fev 2026 · 18:00',
          location: 'Ginásio do Parque',
          admin: 'Carlos Mendes',
          teamA: { name: 'Panteras' },
          teamB: { name: 'Dragões' },
          scoreA: 78,
          scoreB: 82,
        },
        {
          id: '4',
          sport: 'futsal',
          status: 'scheduled',
          role: 'creator',
          date: '20 Fev 2026 · 21:00',
          location: 'Ginásio Norte',
          admin: 'Você',
          teamA: { name: 'Falcões FC' },
          teamB: { name: 'Panteras' },
          scoreA: 0,
          scoreB: 0,
        },
        {
          id: '5',
          sport: 'volleyball',
          status: 'cancelled',
          role: 'member',
          date: '01 Fev 2026 · 17:00',
          location: 'Arena Central',
          admin: 'João Silva',
          teamA: { name: 'Lobos SC' },
          teamB: { name: 'Dragões' },
          scoreA: 0,
          scoreB: 0,
        },
        {
          id: '6',
          sport: 'basketball',
          status: 'scheduled',
          role: 'creator',
          date: '22 Fev 2026 · 18:30',
          location: 'Quadra Coberta',
          admin: 'Você',
          teamA: { name: 'Tubarões' },
          teamB: { name: 'Panteras' },
          scoreA: 0,
          scoreB: 0,
        },
      ] as Match[],
    };
  },

  computed: {
    filteredMatches(): Match[] {
      return this.matches.filter((m) => {
        if (this.filters.status.length > 0 && !this.filters.status.includes(m.status)) {
          return false;
        }
        if (this.filters.role.length > 0 && !this.filters.role.includes(m.role)) {
          return false;
        }
        if (this.filters.sport.length > 0 && !this.filters.sport.includes(m.sport)) {
          return false;
        }
        return true;
      });
    },
  },

  methods: {
    onFiltersUpdate(filters: MatchFilterState) {
      this.filters = filters;
    },
  },
});
</script>

<style scoped>
.matches-page {
  background: #313338;
  min-height: 100vh;
  margin: 0 auto;
}

.matches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

@media (max-width: 480px) {
  .matches-grid {
    grid-template-columns: 1fr;
  }
}
</style>
