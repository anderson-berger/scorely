<script lang="ts">
import type { Game, Group } from '@scorely/contracts';
import TeamsCard from '@scorely/web/src/modules/teams/components/TeamsCard.vue';
import { defineComponent, type PropType } from 'vue';

/**
 * Aba Times (GRP-29, TIM-14): os times do jogo da semana, para todos. O dono monta, sorteia e publica aqui.
 * Jogo cancelado: "Jogo cancelado, sem times". Grupo arquivado não tem jogo (`game = null`): só o aviso (GRP-37).
 * O casco passa os mesmos dados para todas as abas; o que esta não usa não vira atributo (`inheritAttrs`).
 */
export default defineComponent({
  name: 'GroupTeamsPage',

  components: { TeamsCard },

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game | null>, default: null },
    isOwner: { type: Boolean, default: false },
  },
});
</script>

<template>
  <div v-if="!game" class="sc-card sc-caption notice">{{ $t('groups.archivedGame') }}</div>
  <div v-else-if="game.status === 'cancelled'" class="sc-card sc-caption notice">
    {{ $t('teams.empty.cancelled') }}
  </div>
  <TeamsCard v-else :group-id="group.id" :game="game" :sport="group.sport" :is-owner="isOwner" />
</template>

<style scoped>
.notice {
  padding: 24px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}
</style>
