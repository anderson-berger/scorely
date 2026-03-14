<template>
  <q-card
    class="match-card cursor-pointer"
    flat
    bordered
    @click="$router.push({ name: 'app.match.detail', params: { id: match.id } })"
  >
    <q-card-section class="match-card__header row items-center q-pb-sm">
      <q-icon :name="sportIcon" size="20px" color="primary" class="q-mr-sm" />
      <span class="text-caption text-grey-5 text-uppercase">{{ sportLabel }}</span>
      <q-space />
      <MatchStatusBadge :status="match.status" />
    </q-card-section>

    <q-separator />

    <q-card-section class="q-pt-md q-pb-sm">
      <div class="row items-center q-gutter-sm">
        <q-icon name="event" size="14px" color="grey-6" />
        <span class="text-caption text-grey-4">{{ formattedDate }}</span>
      </div>

      <div v-if="match.locationId" class="row items-center q-gutter-sm q-mt-xs">
        <q-icon name="place" size="14px" color="grey-6" />
        <span class="text-caption text-grey-4">{{ match.locationId }}</span>
      </div>
    </q-card-section>

    <q-card-section class="q-pt-xs">
      <div class="row items-center justify-between">
        <div class="text-caption text-grey-5">
          <q-icon name="group" size="14px" class="q-mr-xs" />
          Máx. {{ match.maxPlayers }} jogadores
        </div>
        <q-chip
          :label="match.visibility === 'PUBLIC' ? 'Pública' : 'Privada'"
          :icon="match.visibility === 'PUBLIC' ? 'public' : 'lock'"
          size="sm"
          color="grey-8"
          text-color="grey-4"
          dense
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { Match } from '@scorely/api/modules/match/match_types';
import { SPORT_ICON, SPORT_LABEL } from 'src/modules/match/types/match.ui.types';
import MatchStatusBadge from './MatchStatusBadge.vue';

export default defineComponent({
  name: 'MatchCard',

  components: { MatchStatusBadge },

  props: {
    match: {
      type: Object as PropType<Match>,
      required: true,
    },
  },

  computed: {
    sportIcon(): string {
      return SPORT_ICON[this.match.sport];
    },
    sportLabel(): string {
      return SPORT_LABEL[this.match.sport];
    },
    formattedDate(): string {
      const d = new Date(this.match.date);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
  },
});
</script>

<style scoped>
.match-card {
  background: #2b2d31;
  border-color: #3f4147;
  border-radius: 8px;
  transition: border-color 0.15s ease;
}
.match-card:hover {
  border-color: #5865f2;
}
.match-card__header {
  min-height: 40px;
}
</style>
