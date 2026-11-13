<script lang="ts">
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { defineComponent } from 'vue';

/** `/join/:token`: aceita o convite e vai para o grupo. O login (e o perfil) vem antes, pelo guard. */
export default defineComponent({
  name: 'JoinPage',

  data() {
    return { error: '' };
  },

  async mounted() {
    try {
      const group = await groupsApi.acceptInvite(String(this.$route.params.token));
      await this.$router.replace({ name: 'group', params: { id: group.id } });
    } catch (err) {
      this.error = errorMessage(err);
    }
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page state">
      <template v-if="error">
        <div class="state-text">{{ error }}</div>
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.backToGroups')" :to="{ name: 'groups' }" />
      </template>
      <template v-else>
        <q-spinner color="primary" size="md" />
        <div class="sc-display joining">{{ $t('groups.joining') }}</div>
      </template>
    </div>
  </q-page>
</template>

<style scoped>
.state {
  padding-top: 96px;
  text-align: center;
}

.state-text {
  font-size: 16px;
  margin-bottom: 16px;
}

.joining {
  font-size: 24px;
  margin-top: 16px;
}
</style>
