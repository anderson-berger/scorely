<script lang="ts">
import { TEAM_APART_LIMITS, type TeamApartRule } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { defineComponent, type PropType } from 'vue';

/** Quem dá para marcar numa regra de times opostos: id e nome. */
export interface ApartOption {
  userId: string;
  name: string;
}

/**
 * Painel de uma regra de times opostos (TIM-21, 22): marcar de 2 a 8 pessoas entre as que o dono pode classificar
 * (TIM-04), mais quem já está na regra. Numa regra que já existe, também Remover. Quem chama salva a configuração.
 */
export default defineComponent({
  name: 'TeamApartSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    /** As pessoas para marcar (inclui quem já está na regra, mesmo se saiu do grupo). */
    people: { type: Array as PropType<ApartOption[]>, required: true },
    /** A regra em edição; sem ela, é uma regra nova. */
    rule: { type: Object as PropType<TeamApartRule | undefined>, default: undefined },
    saving: { type: Boolean, default: false },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    save: (_rule: TeamApartRule) => true,
    remove: () => true,
  },

  data() {
    return { picked: [] as string[] };
  },

  computed: {
    valid(): boolean {
      const { min, max } = TEAM_APART_LIMITS.people;
      return this.picked.length >= min && this.picked.length <= max;
    },

    problem(): string {
      const { min, max } = TEAM_APART_LIMITS.people;
      if (this.picked.length < min) return this.$t('teams.settings.apartTooFew', { min });
      if (this.picked.length > max) return this.$t('teams.settings.apartTooMany', { max });
      return '';
    },

    hint(): string {
      return this.$t('teams.settings.apartSheetHint', TEAM_APART_LIMITS.people);
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.picked = [...(this.rule?.people ?? [])];
    },
  },

  methods: {
    toggle(userId: string, on: boolean) {
      this.picked = on ? [...this.picked, userId] : this.picked.filter((id) => id !== userId);
    },

    save() {
      if (this.valid) this.$emit('save', { people: this.picked });
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="$t('teams.settings.editApart')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-caption q-mt-xs">{{ hint }}</div>

    <div class="people">
      <q-checkbox
        v-for="p in people"
        :key="p.userId"
        :model-value="picked.includes(p.userId)"
        :label="p.name"
        class="person"
        @update:model-value="toggle(p.userId, $event)"
      />
    </div>

    <div v-if="problem" class="sc-caption problem">{{ problem }}</div>

    <q-btn
      v-if="rule"
      flat
      no-caps
      dense
      class="sc-danger remove"
      icon="delete_outline"
      :label="$t('teams.settings.removeApart')"
      :disable="saving"
      @click="$emit('remove')"
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
        :disable="!valid"
        @click="save"
      />
    </div>
  </BottomSheet>
</template>

<style scoped>
.people {
  display: flex;
  flex-direction: column;
  margin-top: 12px;
  max-height: 50vh;
  overflow-y: auto;
}

.person {
  min-height: 44px;
  border-bottom: 1px solid var(--sc-line);
}

.problem {
  margin-top: 8px;
  color: var(--sc-danger);
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
