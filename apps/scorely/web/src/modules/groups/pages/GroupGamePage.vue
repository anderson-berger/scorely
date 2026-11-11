<script lang="ts">
import type { Game, PlayerPosition } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import GameCard from '../components/GameCard.vue';

/**
 * Aba Jogo (plano 012): o jogo da semana. Os times (E3) e as partidas (E4) entram aqui como seções.
 * Grupo arquivado não tem jogo (`game = null`): só o aviso, sem placar nem lista (GRP-37).
 * O casco passa os mesmos dados para todas as abas; o que esta não usa não vira atributo (`inheritAttrs`).
 */
export default defineComponent({
  name: 'GroupGamePage',

  components: { GameCard },

  inheritAttrs: false,

  props: {
    game: { type: Object as PropType<Game | null>, default: null },
    busy: { type: Boolean, default: false },
    /** TIM-05: posições de cada pessoa (ausente = o esporte não tem posições). */
    playerPositions: {
      type: Object as PropType<Record<string, PlayerPosition[]> | undefined>,
      default: undefined,
    },
    canEditPositions: { type: Boolean, default: false },
  },

  emits: ['confirm', 'leave', 'editPlayer'],
});
</script>

<template>
  <GameCard
    v-if="game"
    :game="game"
    :busy="busy"
    :player-positions="playerPositions"
    :can-edit-positions="canEditPositions"
    @confirm="$emit('confirm')"
    @leave="$emit('leave')"
    @edit-player="$emit('editPlayer', $event)"
  />
  <div v-else class="sc-card sc-caption no-game">{{ $t('groups.archivedGame') }}</div>
</template>

<style scoped>
.no-game {
  padding: 24px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}
</style>
