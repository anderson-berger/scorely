<script lang="ts">
import type { PlayerPosition, Sport, TeamPlayer } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import { sportPositions } from '../players';
import type { TeamPlayerChange } from '../teams';
import PositionsPicker from './PositionsPicker.vue';

/**
 * Painel de uma pessoa nos times (TIM-14): em que time ela fica (ou sem time / fora dos times) e as posições
 * só neste jogo (TIM-13) e se fica fixa no time (TIM-16). Quem está dentro da lista fica "sem time"; quem é do Banco ou saiu da lista sai dos times.
 */
export default defineComponent({
  name: 'TeamPlayerSheet',

  components: { BottomSheet, PositionsPicker },

  props: {
    modelValue: { type: Boolean, required: true },
    player: { type: Object as PropType<TeamPlayer | undefined>, default: undefined },
    team: { type: Number as PropType<number | undefined>, default: undefined },
    teamCount: { type: Number, required: true },
    sport: { type: String as PropType<Sport>, required: true },
    saving: { type: Boolean, default: false },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    save: (_change: TeamPlayerChange) => true,
  },

  data() {
    return {
      /** -1 = fora dos times (sem time). */
      choice: -1,
      positions: [] as PlayerPosition[],
      adjusted: false,
      pinned: false,
    };
  },

  computed: {
    title(): string {
      return this.player?.name ?? this.$t('groups.unnamed');
    },

    /** Quem está dentro da lista fica "sem time"; os outros saem dos times (TIM-08, 12). */
    noneLabel(): string {
      const inside = this.player?.inList && !this.player.bench;
      return inside ? this.$t('teams.noTeam') : this.$t('teams.removeFromTeams');
    },

    options(): { label: string; value: number }[] {
      const teams = Array.from({ length: this.teamCount }, (_, i) => ({
        label: this.$t('teams.teamName', { n: i + 1 }),
        value: i,
      }));
      return [...teams, { label: this.noneLabel, value: -1 }];
    },

    hasPositions(): boolean {
      return sportPositions(this.sport).length > 0;
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      this.choice = this.team ?? -1;
      this.positions = [...(this.player?.positions ?? [])];
      this.adjusted = this.player?.adjusted ?? false;
      this.pinned = this.player?.pinned ?? false;
    },
  },

  methods: {
    onPositions(positions: PlayerPosition[]) {
      this.positions = positions;
      this.adjusted = true;
    },

    save() {
      const player = this.player;
      if (!player) return;
      this.$emit('save', {
        userId: player.userId,
        team: this.choice >= 0 ? this.choice : undefined,
        positions: this.adjusted ? this.positions : undefined,
        pinned: this.choice >= 0 && this.pinned,
      });
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="title"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-label section">{{ $t('teams.moveTo') }}</div>
    <q-option-group v-model="choice" :options="options" type="radio" class="choices" />
    <template v-if="choice >= 0">
      <q-toggle v-model="pinned" :label="$t('teams.pin')" class="pin" />
      <div class="sc-caption">{{ $t('teams.pinHint') }}</div>
    </template>

    <template v-if="hasPositions">
      <div class="sc-label section">{{ $t('teams.gamePositions') }}</div>
      <div class="sc-caption">{{ $t('teams.gamePositionsHint') }}</div>
      <PositionsPicker :model-value="positions" :sport="sport" @update:model-value="onPositions" />
      <q-btn
        v-if="adjusted"
        flat
        no-caps
        dense
        color="primary"
        class="reset"
        :label="$t('teams.useGroupPositions')"
        @click="adjusted = false"
      />
    </template>

    <div class="actions">
      <q-btn
        flat
        no-caps
        class="sc-btn-outline"
        :label="$t('groups.cancel')"
        :disable="saving"
        @click="$emit('update:modelValue', false)"
      />
      <q-btn
        color="primary"
        unelevated
        class="sc-btn-main"
        :label="$t('groups.save')"
        :loading="saving"
        @click="save"
      />
    </div>
  </BottomSheet>
</template>

<style scoped>
.section {
  margin-top: 14px;
  font-size: 11px;
  color: var(--sc-muted);
}

.choices {
  margin-top: 4px;
}

.pin {
  margin-top: 8px;
}

.reset {
  margin-top: 4px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
