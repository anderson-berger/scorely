<script lang="ts">
import type { Player, PlayerPosition, Sport } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import { errorMessage } from '@/i18n/errors';
import { teamsApi } from '../teams.api';
import PositionsPicker from './PositionsPicker.vue';

/**
 * Painel "Posições de {nome}" (TIM-05): o dono marca e desmarca as posições do esporte e escolhe a principal
 * com a estrela. A primeira marcada já vem como principal (TIM-02).
 */
export default defineComponent({
  name: 'PlayerPositionsSheet',

  components: { BottomSheet, PositionsPicker },

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

    <PositionsPicker v-model="draft" :sport="sport" class="picker" />

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
.picker {
  margin-top: 12px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
