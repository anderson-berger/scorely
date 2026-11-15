<script lang="ts">
import type { Competition, Game, Group, PlayerPosition } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import CompetitionGameLine from '@scorely/web/src/modules/competition/components/CompetitionGameLine.vue';
import { gameCapacityPatch } from '@scorely/web/src/modules/groups/capacity';
import CapacitySheet from '@scorely/web/src/modules/groups/components/CapacitySheet.vue';
import GameCard from '@scorely/web/src/modules/groups/components/GameCard.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import {
  type GroupAccess,
  NO_ACCESS,
  onPermissionError,
  permissionLostInject,
} from '@scorely/web/src/modules/groups/permissions';
import TeamsLine from '@scorely/web/src/modules/teams/components/TeamsLine.vue';
import { defineComponent, type PropType } from 'vue';

/**
 * Aba Jogo (GRP-29): "eu jogo?". Os times ficam na aba Times; aqui, só a linha que leva até lá.
 * Grupo arquivado não tem jogo (`game = null`): só o aviso, sem placar nem lista (GRP-37).
 * O casco passa os mesmos dados para todas as abas; o que esta não usa não vira atributo (`inheritAttrs`).
 */
export default defineComponent({
  name: 'GroupGamePage',

  components: { CapacitySheet, CompetitionGameLine, GameCard, TeamsLine },

  inject: permissionLostInject,

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game | null>, default: null },
    access: { type: Object as PropType<GroupAccess>, default: () => NO_ACCESS },
    /** CMP-17: a competição do grupo, para a linha de fechar o jogo. */
    competition: { type: Object as PropType<Competition | undefined>, default: undefined },
    busy: { type: Boolean, default: false },
    /** TIM-05: posições de cada pessoa (ausente = o esporte não tem posições). */
    playerPositions: {
      type: Object as PropType<Record<string, PlayerPosition[]> | undefined>,
      default: undefined,
    },
    canEditPositions: { type: Boolean, default: false },
  },

  emits: ['confirm', 'leave', 'editPlayer', 'saved', 'competition-reload'],

  data() {
    return { capacityOpen: false, savingCapacity: false };
  },

  computed: {
    /** GRP-45: quem tem `game.manage` muda as vagas do jogo enquanto dá para confirmar (antes do início, não cancelado). */
    canEditCapacity(): boolean {
      return this.access.game && (this.game?.status === 'scheduled' || this.game?.status === 'open');
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
        // GRP-57: sem a permissão, o painel fecha e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) this.capacityOpen = false;
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
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
    :sport-id="group.sportId"
    :can-edit-positions="canEditPositions"
    :can-edit-capacity="canEditCapacity"
    @edit-capacity="capacityOpen = true"
    @confirm="$emit('confirm')"
    @leave="$emit('leave')"
    @edit-player="$emit('editPlayer', $event)"
  >
    <template #teams>
      <TeamsLine :group-id="group.id" :game="game" :can-manage="access.teams" />
      <CompetitionGameLine
        :group="group"
        :game="game"
        :competition="competition"
        :access="access"
        @reload="$emit('competition-reload')"
      />
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
