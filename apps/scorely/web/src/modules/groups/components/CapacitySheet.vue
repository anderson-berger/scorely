<script lang="ts">
import { GROUP_LIMITS } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import HoursStepper from '@/components/HoursStepper.vue';
import { type CapacityField, stepCapacity } from '../capacity';

/**
 * Painel de vagas e mínimo (GRP-45, 46), usado nos Ajustes (padrão do grupo) e no jogo (só aquele jogo).
 * O componente só edita os números; quem chama decide o que salvar.
 */
export default defineComponent({
  name: 'CapacitySheet',

  components: { BottomSheet, HoursStepper },

  props: {
    modelValue: { type: Boolean, required: true },
    title: { type: String, required: true },
    hint: { type: String, required: true },
    slots: { type: Number, required: true },
    minPlayers: { type: Number as PropType<number | undefined>, default: undefined },
    /** Sem isso, o mínimo fica sempre ligado (jogo de um grupo que tem mínimo, GRP-46). */
    canDisableMin: { type: Boolean, default: true },
    /** "Usar o padrão do grupo" (só no jogo com valor próprio). */
    showReset: { type: Boolean, default: false },
    saving: { type: Boolean, default: false },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    save: (_value: { slots: number; minPlayers: number | undefined }) => true,
    reset: () => true,
  },

  data() {
    return { draftSlots: 0, hasMin: false, draftMin: GROUP_LIMITS.minPlayers.min as number };
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      this.draftSlots = this.slots;
      this.hasMin = this.minPlayers !== undefined;
      this.draftMin = this.minPlayers ?? Math.max(GROUP_LIMITS.minPlayers.min, this.slots - 2);
    },
  },

  methods: {
    step(field: CapacityField, dir: 1 | -1) {
      if (field === 'slots') this.draftSlots = stepCapacity(field, this.draftSlots, dir);
      else this.draftMin = stepCapacity(field, this.draftMin, dir);
    },

    save() {
      this.$emit('save', { slots: this.draftSlots, minPlayers: this.hasMin ? this.draftMin : undefined });
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
    <div class="sc-caption q-mt-xs">{{ hint }}</div>

    <div class="row">
      <div>
        <div class="sc-display row-name">{{ $t('groups.capacity.slots') }}</div>
        <div class="sc-caption">{{ $t('groups.capacity.slotsHint') }}</div>
      </div>
      <HoursStepper
        :value="draftSlots"
        :dec-label="$t('groups.capacity.less', { field: $t('groups.capacity.slots') })"
        :inc-label="$t('groups.capacity.more', { field: $t('groups.capacity.slots') })"
        @step="step('slots', $event)"
      />
    </div>

    <q-toggle v-if="canDisableMin" v-model="hasMin" :label="$t('groups.capacity.hasMin')" class="toggle" />

    <div v-if="hasMin || !canDisableMin" class="row">
      <div>
        <div class="sc-display row-name">{{ $t('groups.capacity.min') }}</div>
        <div class="sc-caption">{{ $t('groups.capacity.minHint') }}</div>
      </div>
      <HoursStepper
        :value="draftMin"
        :dec-label="$t('groups.capacity.less', { field: $t('groups.capacity.min') })"
        :inc-label="$t('groups.capacity.more', { field: $t('groups.capacity.min') })"
        @step="step('minPlayers', $event)"
      />
    </div>

    <q-btn
      v-if="showReset"
      flat
      no-caps
      dense
      color="primary"
      class="reset"
      :label="$t('groups.capacity.useGroup')"
      :disable="saving"
      @click="$emit('reset')"
    />

    <div class="actions">
      <q-btn
        flat
        no-caps
        class="sc-btn-outline"
        :label="$t('groups.cancel')"
        :disable="saving"
        @click="$emit('update:modelValue', false)"
      />
      <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
    </div>
  </BottomSheet>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.row-name {
  font-size: 20px;
}

.toggle {
  margin-top: 8px;
}

.reset {
  margin-top: 8px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
