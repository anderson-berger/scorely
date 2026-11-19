<script lang="ts">
import { type Group, UpdateGroupNameInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/** Linha "Nome" dos Ajustes (GRP-29, 7b): o nome e, ao tocar, o painel para mudar (GRP-71). */
export default defineComponent({
  name: 'NameCard',

  components: { BottomSheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: ['saved'],

  data() {
    return { open: false, name: '', saving: false };
  },

  watch: {
    open(isOpen: boolean) {
      if (isOpen) this.name = this.group.name;
    },
  },

  methods: {
    async save() {
      // GRP-71: a versão da identidade (nome, logo e capa) que a tela mostra.
      const parsed = UpdateGroupNameInputSchema.safeParse({ version: this.group.version, name: this.name });
      if (!parsed.success) {
        this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0], 'name') });
        return;
      }
      this.saving = true;
      try {
        await groupsApi.rename(this.group.id, parsed.data);
        this.open = false;
        this.$q.notify({ type: 'positive', message: this.$t('groups.rename.saved') });
        this.$emit('saved');
      } catch (err) {
        // GRP-57: sem a permissão (ou com a versão velha), o painel fecha e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) this.open = false;
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
    <SettingsRow icon="edit" :title="$t('groups.rename.title')" :summary="group.name" @open="open = true" />
    <BottomSheet v-model="open" :title="$t('groups.rename.title')" :persistent="saving">
      <div class="sc-caption q-mt-xs">{{ $t('groups.rename.hint') }}</div>
      <q-input v-model="name" outlined dense maxlength="80" class="q-mt-sm" :label="$t('groups.rename.label')" />
      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="open = false" />
        <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
      </div>
    </BottomSheet>
  </section>
</template>

<style scoped>
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
