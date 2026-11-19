<script lang="ts">
import type { Competition, CompetitionGameDetail, Game, Group } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { showsGameLine } from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import GameCloseSheet from '@scorely/web/src/modules/competition/components/GameCloseSheet.vue';
import MatchesList from '@scorely/web/src/modules/competition/components/MatchesList.vue';
import { type GroupAccess, NO_ACCESS } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * A linha Competição da aba Jogo (CMP-17, 23, GRP-29): para quem fecha, com o jogo atual já começado e a competição
 * ativa. "Fechar o jogo" ou "Jogo fechado · corrigir". Pelo dia, abre o painel de fechar; por partida, o painel do
 * jogo, com as partidas e o fechamento (a chamada).
 */
export default defineComponent({
  name: 'CompetitionGameLine',

  components: { BottomSheet, GameCloseSheet, MatchesList },

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game>, required: true },
    competition: { type: Object as PropType<Competition | undefined>, default: undefined },
    access: { type: Object as PropType<GroupAccess>, default: () => NO_ACCESS },
  },

  emits: { reload: () => true },

  data() {
    return {
      detail: undefined as CompetitionGameDetail | undefined,
      panelOpen: false,
      closeOpen: false,
    };
  },

  computed: {
    shows(): boolean {
      return showsGameLine(
        this.competition,
        this.access,
        this.game,
        Boolean(this.group.archivedAt),
        Date.now(),
      );
    },

    byMatch(): boolean {
      return this.detail?.unit === 'match' && !this.detail.cancelled;
    },

    panelTitle(): string {
      return this.$t('competition.matches.panelTitle', { date: formatDateTime(this.game.startsAt, 'date') });
    },
  },

  watch: {
    shows: { immediate: true, handler: 'load' },
  },

  methods: {
    async load() {
      if (!this.shows) return;
      try {
        this.detail = await competitionApi.game(this.group.id, this.game.id);
      } catch {
        // Sem o jogo da competição a aba Jogo continua funcionando; a linha só não aparece.
        this.detail = undefined;
      }
    },

    open() {
      if (this.byMatch) this.panelOpen = true;
      else this.closeOpen = true;
    },

    onChanged(detail: CompetitionGameDetail) {
      this.detail = detail;
    },
  },
});
</script>

<template>
  <template v-if="shows && detail">
    <button type="button" class="sc-card line" @click="open">
      <q-icon name="emoji_events" size="20px" class="icon" aria-hidden="true" />
      <span class="sc-display text">
        {{ detail.closed ? $t('competition.closing.lineClosed') : $t('competition.closing.line') }}
      </span>
      <q-icon name="chevron_right" size="20px" class="chevron" aria-hidden="true" />
    </button>

    <BottomSheet v-if="byMatch" v-model="panelOpen" :title="panelTitle">
      <MatchesList
        :group-id="group.id"
        :detail="detail"
        can-edit
        @changed="onChanged"
        @reload="$emit('reload')"
      />
      <q-btn
        unelevated
        no-caps
        color="primary"
        class="sc-btn-main close-btn"
        :label="$t('competition.matches.closeGame')"
        @click="closeOpen = true"
      />
    </BottomSheet>

    <GameCloseSheet
      v-model="closeOpen"
      :group-id="group.id"
      :game-id="game.id"
      @saved="onChanged"
      @reload="$emit('reload')"
    />
  </template>
</template>

<style scoped>
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 10px 14px;
  margin-bottom: 20px;
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.icon {
  color: var(--sc-accent);
}

.text {
  flex: 1;
  font-size: 17px;
}

.chevron {
  color: var(--sc-muted);
}

.close-btn {
  width: 100%;
  margin-top: 16px;
}
</style>
