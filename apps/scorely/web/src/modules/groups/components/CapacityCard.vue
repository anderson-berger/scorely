<script lang="ts">
import type { Group } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import CapacitySheet from '@scorely/web/src/modules/groups/components/CapacitySheet.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { defineComponent, type PropType } from 'vue';

/** Vagas e mínimo padrão do grupo, nos Ajustes (GRP-45, 46). */
export default defineComponent({
  name: 'CapacityCard',

  components: { CapacitySheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: ['saved'],

  data() {
    return { editing: false, saving: false };
  },

  methods: {
    async save(value: { slots: number; minPlayers: number | undefined }) {
      this.saving = true;
      try {
        await groupsApi.update(this.group.id, { slots: value.slots, minPlayers: value.minPlayers ?? null });
        this.editing = false;
        this.$q.notify({ type: 'positive', message: this.$t('groups.capacity.saved') });
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
    <div class="head">
      <h2 class="sc-section">{{ $t('groups.capacity.title') }}</h2>
      <q-btn flat no-caps color="primary" class="adjust" :label="$t('groups.capacity.edit')" @click="editing = true" />
    </div>
    <div class="summary">
      <div class="sc-card cell">
        <div class="sc-number value">{{ group.slots }}</div>
        <div class="sc-caption">{{ $t('groups.capacity.slots') }}</div>
      </div>
      <div class="sc-card cell">
        <div class="sc-number value">{{ group.minPlayers ?? '—' }}</div>
        <div class="sc-caption">
          {{ group.minPlayers === undefined ? $t('groups.capacity.noMin') : $t('groups.capacity.min') }}
        </div>
      </div>
    </div>

    <CapacitySheet
      v-model="editing"
      :title="$t('groups.capacity.title')"
      :hint="$t('groups.capacity.hint')"
      :slots="group.slots"
      :min-players="group.minPlayers"
      :saving="saving"
      @save="save"
    />
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.head .sc-section {
  margin: 0;
}

.adjust {
  min-height: 44px;
}

.summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.cell {
  padding: 12px;
  border-radius: 12px;
  min-width: 0;
}

.value {
  font-size: 26px;
}
</style>
