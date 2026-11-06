<script lang="ts">
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { groupsApi } from '../groups.api';

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
  <q-page padding class="flex flex-center">
    <div class="text-center">
      <template v-if="error">
        <div class="text-body1 q-mb-md">{{ error }}</div>
        <q-btn flat color="primary" :label="$t('groups.backHome')" :to="{ name: 'home' }" />
      </template>
      <template v-else>
        <q-spinner size="md" class="q-mb-sm" />
        <div class="text-body2 text-grey-7">{{ $t('groups.joining') }}</div>
      </template>
    </div>
  </q-page>
</template>
