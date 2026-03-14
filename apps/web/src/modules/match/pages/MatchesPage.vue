<template>
  <q-page class="matches-page q-pa-lg">
    <div class="matches-header">
      <h5 class="text-white q-my-none">Partidas</h5>
      <q-btn
        color="primary"
        icon="add"
        label="Nova Partida"
        no-caps
        unelevated
        :to="{ name: 'app.match.create' }"
      />
    </div>

    <div v-if="loading" class="flex flex-center q-mt-xl">
      <q-spinner color="primary" size="40px" />
    </div>

    <template v-else>
      <div class="matches-grid q-mt-lg">
        <MatchCard v-for="match in matches" :key="match.id" :match="match" />
      </div>

      <div v-if="matches.length === 0" class="empty-state text-center q-mt-xl">
        <q-icon name="sports_soccer" size="64px" color="grey-7" />
        <p class="text-grey-5 q-mt-md">Nenhuma partida encontrada</p>
        <q-btn
          color="primary"
          label="Criar primeira partida"
          no-caps
          unelevated
          :to="{ name: 'app.match.create' }"
        />
      </div>

      <div v-if="hasMore" class="flex flex-center q-mt-lg">
        <q-btn
          flat
          color="grey-5"
          label="Carregar mais"
          no-caps
          :loading="loading"
          @click="loadMore"
        />
      </div>
    </template>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { matchStore } from 'src/modules/match/store/matchStore';
import MatchCard from 'src/modules/match/components/MatchCard.vue';

export default defineComponent({
  name: 'MatchesPage',

  components: { MatchCard },

  computed: {
    matches() {
      return matchStore.matches;
    },
    hasMore() {
      return matchStore.hasMore;
    },
    loading() {
      return matchStore.loading;
    },
  },

  async created() {
    await matchStore.fetchMyMatches(true);
  },

  methods: {
    async loadMore() {
      await matchStore.fetchMyMatches(false);
    },
  },
});
</script>

<style scoped>
.matches-page {
  background: #313338;
  min-height: 100vh;
}

.matches-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.matches-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

@media (max-width: 480px) {
  .matches-grid {
    grid-template-columns: 1fr;
  }
}
</style>
