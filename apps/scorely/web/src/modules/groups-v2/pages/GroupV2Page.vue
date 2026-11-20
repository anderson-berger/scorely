<script lang="ts">
import type { GroupV2 } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { defineComponent } from 'vue';

/** GRV-07: a página do grupo, pelo id público (GRV-08). Por enquanto, só o nome. */
export default defineComponent({
  name: 'GroupV2Page',

  data() {
    return {
      group: undefined as GroupV2 | undefined,
      error: '',
    };
  },

  watch: {
    '$route.params.id'() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      const id = this.$route.params.id;
      if (typeof id !== 'string') return;
      this.group = undefined;
      this.error = '';
      try {
        this.group = await groupsV2Api.get(id);
      } catch (err) {
        // GRV-04: quem não participa vê o mesmo "grupo não encontrado" de um código que não existe.
        this.error = errorMessage(err);
      }
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page page">
      <q-btn
        flat
        no-caps
        icon="arrow_back"
        class="back"
        :label="$t('groupsV2.title')"
        :to="{ name: 'groups-v2' }"
      />
      <h1 v-if="group" class="sc-title title">{{ group.name }}</h1>
      <div v-else-if="error" class="sc-caption error">{{ error }}</div>
      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.back {
  margin-bottom: 12px;
}

.title {
  margin: 0;
}

.error {
  padding: 24px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
