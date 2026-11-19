<script lang="ts">
import type { Game, Group } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { type GroupAccess, NO_ACCESS } from '@scorely/web/src/modules/groups/permissions';
import TeamsCard from '@scorely/web/src/modules/teams/components/TeamsCard.vue';
import { defineComponent, type PropType } from 'vue';

/**
 * Aba Times (GRP-29, TIM-14): os times de um dos próximos jogos, para todos. Com mais de um, o topo tem a escolha do
 * jogo (o dia e a hora), começando pelo mais próximo. Quem tem `teams.manage` monta, sorteia e publica aqui.
 * Jogo cancelado: "Jogo cancelado, sem times". Grupo arquivado não tem jogo (`game = null`): só o aviso (GRP-37).
 * O casco passa os mesmos dados para todas as abas; o que esta não usa não vira atributo (`inheritAttrs`).
 */
export default defineComponent({
  name: 'GroupTeamsPage',

  components: { TeamsCard },

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    /** O jogo escolhido (o primeiro dos próximos, sem escolha). */
    game: { type: Object as PropType<Game | null>, default: null },
    /** GRP-11: os próximos jogos, para a escolha (TIM-14). */
    games: { type: Array as PropType<Game[]>, default: () => [] },
    access: { type: Object as PropType<GroupAccess>, default: () => NO_ACCESS },
  },

  emits: { 'select-game': (_gameId: string) => true },

  computed: {
    /** TIM-14: "Ter 18/11 · 19:00" de cada próximo jogo. */
    options(): { label: string; value: string }[] {
      return this.games.map((g) => ({
        value: g.id,
        label: `${formatDateTime(g.startsAt, 'weekday')} ${formatDateTime(g.startsAt, 'dayMonth')} · ${formatDateTime(g.startsAt, 'time')}`,
      }));
    },
  },
});
</script>

<template>
  <q-btn-toggle
    v-if="games.length > 1 && game"
    class="picker"
    no-caps
    unelevated
    toggle-color="primary"
    :model-value="game.id"
    :options="options"
    @update:model-value="$emit('select-game', $event)"
  />
  <div v-if="!game" class="sc-card sc-caption notice">{{ $t('groups.archivedGame') }}</div>
  <div v-else-if="game.status === 'cancelled'" class="sc-card sc-caption notice">
    {{ $t('teams.empty.cancelled') }}
  </div>
  <TeamsCard v-else :group-id="group.id" :game="game" :sport-id="group.sportId" :can-manage="access.teams" />
</template>

<style scoped>
.picker {
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.notice {
  padding: 24px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}
</style>
