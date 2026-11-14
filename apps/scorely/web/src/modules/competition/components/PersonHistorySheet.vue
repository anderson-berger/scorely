<script lang="ts">
import type { PersonGame, PersonHistory, Trophy } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import {
  personGameParts,
  pointsText,
  type Text,
  trophyText,
} from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import { defineComponent } from 'vue';

/**
 * O histórico da pessoa (CMP-27), no painel de baixo: o total, as presenças e a maior sequência no topo, e cada jogo
 * fechado com o que aconteceu e os pontos, do mais recente para o mais antigo.
 */
export default defineComponent({
  name: 'PersonHistorySheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    userId: { type: String, required: true },
    name: { type: String, required: true },
  },

  emits: { 'update:modelValue': (_open: boolean) => true },

  data() {
    return { history: undefined as PersonHistory | undefined, loadError: '' };
  },

  watch: {
    modelValue: { immediate: true, handler: 'load' },
    userId: 'load',
  },

  methods: {
    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    dateOf(g: PersonGame): string {
      return formatDateTime(g.startsAt, 'date');
    },

    partsOf(g: PersonGame): string {
      return personGameParts(g).map(this.text).join(' · ');
    },

    trophyLine(t: Trophy): string {
      return trophyText(t).slice(0, 2).map(this.text).join(' · ');
    },

    pointsOf(g: PersonGame): string {
      return g.points === undefined ? '' : pointsText(g.points);
    },

    async load() {
      if (!this.modelValue) return;
      this.history = undefined;
      this.loadError = '';
      try {
        this.history = await competitionApi.person(this.groupId, this.userId);
      } catch (err) {
        this.loadError = errorMessage(err);
      }
    },
  },
});
</script>

<template>
  <BottomSheet :model-value="modelValue" :title="name" @update:model-value="$emit('update:modelValue', $event)">
    <div v-if="loadError" class="sc-caption q-mt-xs">{{ loadError }}</div>
    <div v-else-if="!history" class="state"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <div class="sc-display total">
        {{
          $t('competition.ranking.total', {
            points: history.points,
            attendance: history.attendance,
            streak: history.streak,
          })
        }}
      </div>
      <div v-if="history.trophies.length > 0" class="trophies">
        <div class="sc-caption">{{ $t('competition.trophies.inGroup') }}</div>
        <div v-for="t in history.trophies" :key="`${t.seasonId}-${t.kind}`" class="trophy">
          <q-icon name="emoji_events" size="18px" aria-hidden="true" />
          {{ trophyLine(t) }}
        </div>
      </div>
      <div v-if="history.games.length === 0" class="sc-caption">{{ $t('competition.ranking.noGames') }}</div>
      <div v-for="g in history.games" :key="g.date" class="game">
        <div class="who">
          <div class="name">{{ dateOf(g) }}</div>
          <div class="sc-caption">{{ partsOf(g) }}</div>
        </div>
        <span v-if="pointsOf(g)" class="sc-number points">{{ pointsOf(g) }}</span>
      </div>
      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('competition.close')"
          @click="$emit('update:modelValue', false)"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.state {
  padding: 24px 0;
  text-align: center;
}

.total {
  margin: 6px 0 10px;
  font-size: 17px;
}

.game {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sc-line);
}

.who {
  min-width: 0;
}

.name {
  font-size: 15px;
}

.points {
  flex-shrink: 0;
  font-size: 20px;
}

.actions {
  display: grid;
  margin-top: 16px;
}

.trophies {
  margin-bottom: 12px;
}

.trophy {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  color: var(--sc-accent);
}
</style>
