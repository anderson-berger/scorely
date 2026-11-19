<script lang="ts">
import type {
  Competition,
  CompetitionGame,
  CompetitionGameDetail,
  GamePerson,
  Group,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import {
  canCloseGames,
  gameStateText,
  personParts,
  pointsText,
  resultText,
  type Text,
} from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import GameCloseSheet from '@scorely/web/src/modules/competition/components/GameCloseSheet.vue';
import MatchesList from '@scorely/web/src/modules/competition/components/MatchesList.vue';
import { type GroupAccess, NO_ACCESS } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * Os jogos na aba Competição (CMP-16, 18): a lista desde a ativação, com o estado. Quem fecha tem "Fechar" e "Corrigir"
 * (o painel de fechar); tocar num jogo abre o detalhe, com o resultado (ou as partidas, CMP-23) e os pontos de cada pessoa.
 */
export default defineComponent({
  name: 'CompetitionGames',

  components: { BottomSheet, GameCloseSheet, MatchesList },

  props: {
    group: { type: Object as PropType<Group>, required: true },
    competition: { type: Object as PropType<Competition>, required: true },
    access: { type: Object as PropType<GroupAccess>, default: () => NO_ACCESS },
  },

  emits: { reload: () => true },

  data() {
    return {
      games: undefined as CompetitionGame[] | undefined,
      loadError: '',
      closing: undefined as string | undefined,
      closeOpen: false,
      detail: undefined as CompetitionGameDetail | undefined,
      detailOpen: false,
    };
  },

  computed: {
    canClose(): boolean {
      return canCloseGames(this.competition, this.access, Boolean(this.group.archivedAt));
    },
  },

  watch: {
    'group.id': { immediate: true, handler: 'load' },
  },

  methods: {
    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    resultOf(d: CompetitionGameDetail): string {
      return this.text(resultText(d));
    },

    stateOf(g: CompetitionGame): string {
      return this.text(gameStateText(g));
    },

    dateOf(iso: string): string {
      return formatDateTime(iso, 'date');
    },

    nameOf(p: GamePerson): string {
      return p.nickname;
    },

    partsOf(p: GamePerson): string {
      return personParts(p).map(this.text).join(' · ');
    },

    pointsOf(p: GamePerson): string {
      return p.points === undefined ? '' : pointsText(p.points);
    },

    async load() {
      this.loadError = '';
      try {
        this.games = await competitionApi.games(this.group.id);
      } catch (err) {
        this.loadError = errorMessage(err);
      }
    },

    openClose(g: CompetitionGame) {
      this.closing = g.id;
      this.closeOpen = true;
    },

    async openDetail(g: CompetitionGame) {
      if (g.state === 'cancelled') return;
      try {
        this.detail = await competitionApi.game(this.group.id, g.id);
        this.detailOpen = true;
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    /** CMP-22: uma partida mudou: o detalhe e a lista mostram o novo. */
    async onDetailChanged(d: CompetitionGameDetail) {
      this.detail = d;
      await this.load();
    },

    async onSaved() {
      await this.load();
    },
  },
});
</script>

<template>
  <section>
    <h2 class="sc-section">{{ $t('competition.games.title') }}</h2>
    <div v-if="loadError" class="sc-card sc-caption notice">{{ loadError }}</div>
    <div v-else-if="!games" class="state"><q-spinner color="primary" size="md" /></div>
    <div v-else-if="games.length === 0" class="sc-card sc-caption notice">{{ $t('competition.games.empty') }}</div>
    <div v-else class="sc-card list">
      <div v-for="g in games" :key="g.date" class="game">
        <button type="button" class="game-main" :disabled="g.state === 'cancelled'" @click="openDetail(g)">
          <span class="sc-display date">{{ dateOf(g.startsAt) }}</span>
          <span class="sc-caption state" :class="`state--${g.state}`">{{ stateOf(g) }}</span>
        </button>
        <q-btn
          v-if="canClose"
          flat
          no-caps
          dense
          class="sc-btn-outline"
          :label="g.state === 'closed' ? $t('competition.games.fix') : $t('competition.games.close')"
          @click="openClose(g)"
        />
      </div>
    </div>

    <GameCloseSheet
      v-if="closing"
      v-model="closeOpen"
      :group-id="group.id"
      :game-id="closing"
      @saved="onSaved"
      @reload="$emit('reload')"
    />

    <BottomSheet
      v-model="detailOpen"
      :title="detail ? $t('competition.closing.title', { date: dateOf(detail.startsAt) }) : ''"
    >
      <template v-if="detail">
        <div v-if="detail.unit === 'day' || detail.cancelled" class="sc-display result">{{ resultOf(detail) }}</div>
        <div v-if="detail.friendly" class="sc-caption">{{ $t('competition.games.friendlyHint') }}</div>
        <MatchesList
          v-if="detail.unit === 'match' && !detail.cancelled"
          :group-id="group.id"
          :detail="detail"
          :can-edit="canClose"
          @changed="onDetailChanged"
          @reload="$emit('reload')"
        />
        <div v-for="p in detail.people" :key="p.id" class="person">
          <div class="who">
            <div class="name">{{ nameOf(p) }}</div>
            <div class="sc-caption">{{ partsOf(p) }}</div>
          </div>
          <span v-if="pointsOf(p)" class="sc-number points">{{ pointsOf(p) }}</span>
        </div>
        <div class="actions">
          <q-btn flat no-caps class="sc-btn-outline" :label="$t('competition.close')" @click="detailOpen = false" />
        </div>
      </template>
    </BottomSheet>
  </section>
</template>

<style scoped>
.notice {
  padding: 18px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

.state {
  padding: 18px 0;
  text-align: center;
}

.list {
  padding: 0 14px;
}

.game {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sc-line);
}

.game:last-child {
  border-bottom: 0;
}

.game-main {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.game-main:disabled {
  cursor: default;
}

.date {
  font-size: 17px;
}

.state--closed {
  color: var(--sc-accent);
}

.result {
  margin: 6px 0 10px;
  font-size: 20px;
}

.person {
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
  font-size: 22px;
}

.actions {
  display: grid;
  margin-top: 16px;
}
</style>
