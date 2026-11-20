<script lang="ts">
import { CreateGroupV2InputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { defineComponent } from 'vue';

/**
 * GRV-07: criar grupo no painel de baixo, por cima da lista, só com o nome (GRV-01). É a rota filha
 * `/v2/groups/new`: fechar espera a animação; criando, vai para a página do grupo.
 */
export default defineComponent({
  name: 'GroupV2CreateForm',

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
        await this.$router.replace({ name: 'group-v2', params: { id: this.createdId } });
        return;
      }
      if (this.$route.name === 'group-v2-create') await this.$router.replace({ name: 'groups-v2' });
    },

    async save() {
      const parsed = CreateGroupV2InputSchema.safeParse({ name: this.name });
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        const group = await groupsV2Api.create(parsed.data);
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
  <BottomSheet v-model="open" :title="$t('groupsV2.createTitle')" :persistent="saving" @hide="closed">
    <div class="sc-caption q-mt-xs">{{ $t('groupsV2.createHint') }}</div>

    <q-form class="fields" @submit.prevent="save">
      <div>
        <label for="group-v2-name" class="sc-label field-label">{{ $t('groupsV2.name') }}</label>
        <q-input v-model="name" for="group-v2-name" outlined autofocus />
      </div>

      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('groupsV2.cancel')"
          :disable="saving"
          @click="open = false"
        />
        <q-btn
          type="submit"
          color="primary"
          unelevated
          class="sc-btn-main"
          :label="$t('groupsV2.create')"
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
