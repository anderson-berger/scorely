<script lang="ts">
import type { Player, PlayerPosition, Sport } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import { errorMessage } from '@/i18n/errors';
import { makeMain, sportPositions, togglePosition } from '../players';
import { teamsApi } from '../teams.api';

/**
 * Painel "Posições de {nome}" (TIM-05): o dono marca e desmarca as posições do esporte e escolhe a principal
 * com a estrela. A primeira marcada já vem como principal (TIM-02).
 */
export default defineComponent({
  name: 'PlayerPositionsSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    sport: { type: String as PropType<Sport>, required: true },
    player: { type: Object as PropType<Player | undefined>, default: undefined },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_player: Player) => true,
  },

  data() {
    return { saving: false, draft: [] as PlayerPosition[] };
  },

  computed: {
    options(): readonly PlayerPosition[] {
      return sportPositions(this.sport);
    },

    title(): string {
      return this.$t('teams.editPositions', { name: this.player?.name ?? this.$t('groups.unnamed') });
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.draft = [...(this.player?.positions ?? [])];
    },
  },

  methods: {
    label(position: PlayerPosition): string {
      return this.$t(`teams.positions.${position}`);
    },

    toggle(position: PlayerPosition, on: boolean) {
      this.draft = togglePosition(this.draft, position, on);
    },

    setMain(position: PlayerPosition) {
      this.draft = makeMain(this.draft, position);
    },

    async save() {
      const player = this.player;
      if (!player) return;
      this.saving = true;
      try {
        const saved = await teamsApi.updatePlayer(this.groupId, player.userId, { positions: this.draft });
        this.$emit('saved', saved);
        this.$emit('update:modelValue', false);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
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
    <div class="sc-caption q-mt-xs">{{ $t('teams.positionsHint') }}</div>

    <div class="options">
      <div v-for="position in options" :key="position" class="sc-row option">
        <q-checkbox
          :model-value="draft.includes(position)"
          :label="label(position)"
          class="check"
          @update:model-value="toggle(position, $event)"
        />
        <template v-if="draft.includes(position)">
          <span v-if="draft[0] === position" class="sc-label main">
            <q-icon name="star" size="16px" />
            {{ $t('teams.main') }}
          </span>
          <q-btn
            v-else
            flat
            round
            dense
            icon="star_outline"
            class="star"
            :aria-label="$t('teams.makeMain', { position: label(position) })"
            @click="setMain(position)"
          />
        </template>
      </div>
    </div>

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
.options {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
}

.check {
  flex-grow: 1;
}

.main {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--sc-accent);
  padding-right: 8px;
}

.star {
  color: var(--sc-muted);
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
