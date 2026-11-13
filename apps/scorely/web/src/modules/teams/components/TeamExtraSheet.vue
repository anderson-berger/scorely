<script lang="ts">
import {
  type Gender,
  type PlayerPosition,
  type Sport,
  TEAM_EXTRA_LIMITS,
  type TeamExtra,
  TeamExtraSchema,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { uuid } from '@scorely/web/src/lib/uuid';
import PositionsPicker from '@scorely/web/src/modules/teams/components/PositionsPicker.vue';
import { sportPositions } from '@scorely/web/src/modules/teams/players';
import { defineComponent, type PropType } from 'vue';

/**
 * Painel do avulso (TIM-24): nome, gênero (ou não informar) e posições do esporte. Num avulso que já existe, também
 * Remover. Quem chama salva os times.
 */
export default defineComponent({
  name: 'TeamExtraSheet',

  components: { BottomSheet, PositionsPicker },

  props: {
    modelValue: { type: Boolean, required: true },
    sport: { type: String as PropType<Sport>, required: true },
    /** O avulso em edição; sem ele, é um avulso novo. */
    extra: { type: Object as PropType<TeamExtra | undefined>, default: undefined },
    saving: { type: Boolean, default: false },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    save: (_extra: TeamExtra) => true,
    remove: (_id: string) => true,
  },

  data() {
    return {
      id: '',
      name: '',
      /** '' = não informar. */
      gender: '' as Gender | '',
      positions: [] as PlayerPosition[],
    };
  },

  computed: {
    draft(): TeamExtra | undefined {
      const parsed = TeamExtraSchema.safeParse({
        id: this.id,
        name: this.name,
        ...(this.gender && { gender: this.gender }),
        positions: this.positions,
      });
      return parsed.success ? parsed.data : undefined;
    },

    genderOptions(): { label: string; value: Gender | '' }[] {
      return [
        { label: this.$t('teams.extra.genders.M'), value: 'M' },
        { label: this.$t('teams.extra.genders.F'), value: 'F' },
        { label: this.$t('teams.extra.noGender'), value: '' },
      ];
    },

    hasPositions(): boolean {
      return sportPositions(this.sport).length > 0;
    },

    maxName(): number {
      return TEAM_EXTRA_LIMITS.name.max;
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      this.id = this.extra?.id ?? uuid();
      this.name = this.extra?.name ?? '';
      this.gender = this.extra?.gender ?? '';
      this.positions = [...(this.extra?.positions ?? [])];
    },
  },

  methods: {
    save() {
      if (this.draft) this.$emit('save', this.draft);
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="extra ? $t('teams.extra.edit') : $t('teams.extra.title')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-caption q-mt-xs">{{ $t('teams.extra.hint') }}</div>

    <q-input
      v-model="name"
      outlined
      dense
      autofocus
      :maxlength="maxName"
      :label="$t('teams.extra.name')"
      class="field"
    />

    <div class="sc-label section">{{ $t('teams.extra.gender') }}</div>
    <q-option-group v-model="gender" :options="genderOptions" type="radio" inline />

    <template v-if="hasPositions">
      <div class="sc-label section">{{ $t('teams.extra.positions') }}</div>
      <PositionsPicker v-model="positions" :sport="sport" />
    </template>

    <q-btn
      v-if="extra"
      flat
      no-caps
      dense
      class="sc-danger remove"
      icon="delete_outline"
      :label="$t('teams.extra.remove')"
      :disable="saving"
      @click="$emit('remove', extra.id)"
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
      <q-btn
        color="primary"
        unelevated
        class="sc-btn-main"
        :label="$t('groups.save')"
        :loading="saving"
        :disable="!draft"
        @click="save"
      />
    </div>
  </BottomSheet>
</template>

<style scoped>
.field {
  margin-top: 12px;
}

.section {
  margin-top: 14px;
  font-size: 11px;
  color: var(--sc-muted);
}

.remove {
  margin-top: 8px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
