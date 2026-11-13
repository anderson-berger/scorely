<script lang="ts">
import { GROUP_LIMITS, type Group, UpdateGroupInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { limitsSummary } from '@scorely/web/src/modules/groups/settings';
import { defineComponent, type PropType } from 'vue';

type LimitKey = 'maxMembers' | 'maxReserves';

interface LimitRow {
  key: LimitKey;
  name: string;
  value: number;
  hint: string;
}

const KEYS: LimitKey[] = ['maxMembers', 'maxReserves'];

/** Linha "Limites" dos Ajustes (GRP-29): o resumo e, ao tocar, o painel dos limites de membros e reservas (GRP-38). */
export default defineComponent({
  name: 'LimitsCard',

  components: { BottomSheet, HoursStepper, SettingsRow },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: ['saved'],

  data() {
    return {
      editing: false,
      saving: false,
      draft: { maxMembers: 0, maxReserves: 0 } as Record<LimitKey, number>,
    };
  },

  computed: {
    /** "30 membros · 30 reservas". */
    summary(): string {
      return limitsSummary(this.group)
        .map((t) => this.$t(t.key, t.params ?? {}))
        .join(' · ');
    },

    rows(): LimitRow[] {
      return KEYS.map((key) => ({
        key,
        name: this.$t(`groups.limits.${key}`),
        value: this.draft[key],
        hint: this.$t(`groups.limits.${key}Hint`),
      }));
    },
  },

  methods: {
    open() {
      this.draft = { maxMembers: this.group.maxMembers, maxReserves: this.group.maxReserves };
      this.editing = true;
    },

    step(key: LimitKey, dir: 1 | -1) {
      const { min, max } = GROUP_LIMITS[key];
      this.draft = { ...this.draft, [key]: Math.min(max, Math.max(min, this.draft[key] + dir)) };
    },

    async save() {
      const parsed = UpdateGroupInputSchema.safeParse(this.draft);
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        await groupsApi.update(this.group.id, parsed.data);
        this.editing = false;
        this.$q.notify({ type: 'positive', message: this.$t('groups.limits.saved') });
        this.$emit('saved');
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
  <section>
    <SettingsRow icon="manage_accounts" :title="$t('groups.limits.title')" :summary="summary" @open="open" />

    <BottomSheet v-model="editing" :title="$t('groups.limits.title')" :persistent="saving">
      <div class="sc-caption q-mt-xs">{{ $t('groups.limits.hint') }}</div>

      <div v-for="r in rows" :key="r.key" class="row">
        <div>
          <div class="sc-display row-name">{{ r.name }}</div>
          <div class="sc-caption">{{ r.hint }}</div>
        </div>
        <HoursStepper
          :value="r.value"
          :dec-label="$t('groups.limits.less', { limit: r.name })"
          :inc-label="$t('groups.limits.more', { limit: r.name })"
          @step="step(r.key, $event)"
        />
      </div>

      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="editing = false" />
        <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
      </div>
    </BottomSheet>
  </section>
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

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
