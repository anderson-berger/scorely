<script lang="ts">
import { CreateGroupInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { defineComponent } from 'vue';

/**
 * GRV-07: criar grupo no painel de baixo, por cima da lista, só com o nome (GRV-01). É a rota filha
 * `/groups/new`: fechar espera a animação; criando, vai para a página do grupo.
 */
export default defineComponent({
  name: 'GroupCreateForm',

  components: { BottomSheet },

  data() {
    return {
      open: true,
      name: '',
      saving: false,
      /** O id público do grupo criado: para onde ir quando o painel terminar de fechar. */
      createdId: '',
    };
  },

  methods: {
    /** Chamado quando o painel termina de fechar. */
    async closed() {
      if (this.createdId) {
        await this.$router.replace({ name: 'group', params: { id: this.createdId } });
        return;
      }
      if (this.$route.name === 'group-create') await this.$router.replace({ name: 'groups' });
    },

    async save() {
      const parsed = CreateGroupInputSchema.safeParse({ name: this.name });
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        const group = await groupsApi.create(parsed.data);
        this.createdId = group.id;
        this.open = false;
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
  <BottomSheet v-model="open" :title="$t('groups.createTitle')" :persistent="saving" @hide="closed">
    <div class="sc-caption q-mt-xs">{{ $t('groups.createHint') }}</div>

    <q-form class="fields" @submit.prevent="save">
      <div>
        <label for="group-name" class="sc-label field-label">{{ $t('groups.name') }}</label>
        <q-input v-model="name" for="group-name" outlined autofocus />
      </div>

      <div class="actions">
        <q-btn
          flat
          no-caps
          :label="$t('groups.cancel')"
          :disable="saving"
          @click="open = false"
        />
        <q-btn
          type="submit"
          color="primary"
          unelevated
          class="sc-btn-main"
          :label="$t('groups.create')"
          :loading="saving"
        />
      </div>
    </q-form>
  </BottomSheet>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
