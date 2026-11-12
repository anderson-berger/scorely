<script lang="ts">
import type { Game, Group, PlayerPosition } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { errorMessage } from '@/i18n/errors';
import TeamsCard from '../../teams/components/TeamsCard.vue';
import { gameCapacityPatch } from '../capacity';
import CapacitySheet from '../components/CapacitySheet.vue';
import GameCard from '../components/GameCard.vue';
import { groupsApi } from '../groups.api';

/**
 * Aba Jogo (plano 012): o jogo da semana. Os times (E3) e as partidas (E4) entram aqui como seções.
 * Grupo arquivado não tem jogo (`game = null`): só o aviso, sem placar nem lista (GRP-37).
 * O casco passa os mesmos dados para todas as abas; o que esta não usa não vira atributo (`inheritAttrs`).
 */
export default defineComponent({
  name: 'GroupGamePage',

  components: { CapacitySheet, GameCard, TeamsCard },

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game | null>, default: null },
    isOwner: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    /** TIM-05: posições de cada pessoa (ausente = o esporte não tem posições). */
    playerPositions: {
      type: Object as PropType<Record<string, PlayerPosition[]> | undefined>,
      default: undefined,
    },
    canEditPositions: { type: Boolean, default: false },
  },

  emits: ['confirm', 'leave', 'editPlayer', 'saved'],

  data() {
    return { capacityOpen: false, savingCapacity: false };
  },

  computed: {
    /** GRP-45: o dono muda as vagas do jogo enquanto dá para confirmar (antes do início, não cancelado). */
    canEditCapacity(): boolean {
      return this.isOwner && (this.game?.status === 'scheduled' || this.game?.status === 'open');
    },
  },

  methods: {
    async saveCapacity(patch: { slots?: number | null; minPlayers?: number | null }) {
      const game = this.game;
      if (!game) return;
      if (Object.keys(patch).length === 0) {
        this.capacityOpen = false;
        return;
      }
      this.savingCapacity = true;
      try {
        await groupsApi.updateGame(this.group.id, game.date, patch);
        this.capacityOpen = false;
        this.$q.notify({ type: 'positive', message: this.$t('groups.capacity.saved') });
        this.$emit('saved');
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.savingCapacity = false;
      }
    },

    onCapacity(value: { slots: number; minPlayers: number | undefined }) {
      if (this.game) void this.saveCapacity(gameCapacityPatch(this.game, value));
    },
  },
});
</script>

<template>
  <GameCard
    v-if="game"
    :game="game"
    :busy="busy"
    :player-positions="playerPositions"
    :can-edit-positions="canEditPositions"
    :can-edit-capacity="canEditCapacity"
    @edit-capacity="capacityOpen = true"
    @confirm="$emit('confirm')"
    @leave="$emit('leave')"
    @edit-player="$emit('editPlayer', $event)"
  >
    <template #teams>
      <TeamsCard :group-id="group.id" :game="game" :sport="group.sport" :is-owner="isOwner" />
    </template>
  </GameCard>
  <CapacitySheet
    v-if="game && canEditCapacity"
    v-model="capacityOpen"
    :title="$t('groups.capacity.gameTitle')"
    :hint="$t('groups.capacity.gameHint')"
    :slots="game.slots"
    :min-players="game.minPlayers"
    :can-disable-min="group.minPlayers === undefined"
    :show-reset="Boolean(game.slotsCustom || game.minPlayersCustom)"
    :saving="savingCapacity"
    @save="onCapacity"
    @reset="saveCapacity({ slots: null, minPlayers: null })"
  />
  <div v-if="!game" class="sc-card sc-caption no-game">{{ $t('groups.archivedGame') }}</div>
</template>

<style scoped>
.no-game {
  padding: 24px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}
</style>
