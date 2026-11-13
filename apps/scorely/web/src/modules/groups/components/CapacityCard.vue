<script lang="ts">
import type { Group } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import CapacitySheet from '@scorely/web/src/modules/groups/components/CapacitySheet.vue';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { capacitySummary } from '@scorely/web/src/modules/groups/settings';
import { defineComponent, type PropType } from 'vue';

/** Linha "Vagas e mínimo" dos Ajustes (GRP-29): o resumo e, ao tocar, o painel das vagas padrão (GRP-45, 46). */
export default defineComponent({
  name: 'CapacityCard',

  components: { CapacitySheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: ['saved'],

  data() {
    return { editing: false, saving: false };
  },

  computed: {
    /** "14 vagas · sem mínimo". */
    summary(): string {
      return capacitySummary(this.group)
        .map((t) => this.$t(t.key, t.params ?? {}))
        .join(' · ');
    },
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
        // GRP-57: sem a permissão, o painel fecha e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) this.editing = false;
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow
      icon="groups"
      :title="$t('groups.capacity.title')"
      :summary="summary"
      @open="editing = true"
    />
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
