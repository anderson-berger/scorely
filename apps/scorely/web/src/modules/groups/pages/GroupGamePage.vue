<script lang="ts">
import type { Competition, Game, Group, PlayerPosition } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import CompetitionGameLine from '@scorely/web/src/modules/competition/components/CompetitionGameLine.vue';
import { gameCapacityPatch } from '@scorely/web/src/modules/groups/capacity';
import CapacitySheet from '@scorely/web/src/modules/groups/components/CapacitySheet.vue';
import GameCard from '@scorely/web/src/modules/groups/components/GameCard.vue';
import GameWhenSheet from '@scorely/web/src/modules/groups/components/GameWhenSheet.vue';
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
 * Aba Jogo (GRP-29): "eu jogo?", um card por próximo jogo (GRP-11), em ordem de início. Os times ficam na aba Times;
 * aqui, só a linha que leva até lá. Grupo arquivado não tem jogos: só o aviso, sem placar nem lista (GRP-37).
 * O casco passa os mesmos dados para todas as abas; o que esta não usa não vira atributo (`inheritAttrs`).
 */
export default defineComponent({
  name: 'GroupGamePage',

  components: { CapacitySheet, CompetitionGameLine, GameCard, GameWhenSheet, TeamsLine },

  inject: permissionLostInject,

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    /** GRP-11: os próximos jogos (vazio no grupo arquivado). */
    games: { type: Array as PropType<Game[]>, default: () => [] },
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

  emits: {
    confirm: (_gameId: string) => true,
    leave: (_gameId: string) => true,
    editPlayer: (_userId: string) => true,
    saved: () => true,
    'competition-reload': () => true,
  },

  data() {
    return {
      capacityOpen: false,
      savingCapacity: false,
      capacityGameId: undefined as string | undefined,
      /** GRP-68, 69: o painel do jogo extra (sem jogo) ou de remarcar (com o jogo). */
      whenOpen: false,
      whenGameId: undefined as string | undefined,
    };
  },

  computed: {
    /** O jogo do painel das vagas. */
    capacityGame(): Game | undefined {
      return this.games.find((g) => g.id === this.capacityGameId);
    },

    /** O jogo a remarcar (ausente = jogo extra novo). */
    whenGame(): Game | undefined {
      return this.games.find((g) => g.id === this.whenGameId);
    },

    /** GRP-68: marcar um jogo extra, com `game.manage` e o grupo ativo. */
    canAddExtra(): boolean {
      return this.access.game && !this.group.archivedAt;
    },
  },

  methods: {
    /** GRP-45: quem tem `game.manage` muda as vagas do jogo enquanto dá para confirmar (antes do início, não cancelado). */
    canEditCapacity(game: Game): boolean {
      return this.access.game && (game.status === 'scheduled' || game.status === 'open');
    },

    openWhen(game?: Game) {
      this.whenGameId = game?.id;
      this.whenOpen = true;
    },

    openCapacity(game: Game) {
      this.capacityGameId = game.id;
      this.capacityOpen = true;
    },

    async saveCapacity(patch: { slots?: number | null; minPlayers?: number | null }) {
      const game = this.capacityGame;
      if (!game) return;
      if (Object.keys(patch).length === 0) {
        this.capacityOpen = false;
        return;
      }
      this.savingCapacity = true;
      try {
        await groupsApi.updateGame(this.group.id, game.id, { ...patch, version: game.version });
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
      if (this.capacityGame) void this.saveCapacity(gameCapacityPatch(this.capacityGame, value));
    },
  },
});
</script>

<template>
  <div class="games">
    <GameCard
      v-for="game in games"
      :key="game.id"
      :game="game"
      :busy="busy"
      :player-positions="playerPositions"
      :sport-id="group.sportId"
      :can-edit-positions="canEditPositions"
      :can-edit-capacity="canEditCapacity(game)"
      :can-reschedule="canEditCapacity(game)"
      @edit-capacity="openCapacity(game)"
      @reschedule="openWhen(game)"
      @confirm="$emit('confirm', game.id)"
      @leave="$emit('leave', game.id)"
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
  </div>
  <CapacitySheet
    v-if="capacityGame"
    v-model="capacityOpen"
    :title="$t('groups.capacity.gameTitle')"
    :hint="$t('groups.capacity.gameHint')"
    :slots="capacityGame.slots"
    :min-players="capacityGame.minPlayers"
    :can-disable-min="group.minPlayers === undefined"
    :show-reset="Boolean(capacityGame.slotsCustom || capacityGame.minPlayersCustom)"
    :saving="savingCapacity"
    @save="onCapacity"
    @reset="saveCapacity({ slots: null, minPlayers: null })"
  />
  <GameWhenSheet
    v-model="whenOpen"
    :group-id="group.id"
    :time-zone="group.timeZone"
    :slots="group.slots"
    :min-players="group.minPlayers"
    :game="whenGame"
    @saved="$emit('saved')"
  />
  <div v-if="games.length === 0" class="sc-card sc-caption no-game">{{ $t('groups.archivedGame') }}</div>
  <q-btn
    v-if="canAddExtra"
    flat
    no-caps
    color="primary"
    icon="add"
    class="add-extra"
    :label="$t('groups.when.addExtra')"
    @click="openWhen()"
  />

</template>

<style scoped>
.games {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.add-extra {
  margin-top: 8px;
}

.no-game {
  padding: 24px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}
</style>
