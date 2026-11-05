<script lang="ts">
import { defineComponent } from 'vue';
import { useAuthStore } from '@/modules/auth/auth.store';
import { displayName } from '@/modules/users/user.display';

export default defineComponent({
  name: 'HomePage',

  setup() {
    return { auth: useAuthStore() };
  },

  computed: {
    greeting(): string {
      return this.auth.user
        ? this.$t('home.greeting', { name: displayName(this.auth.user) })
        : this.$t('home.greetingAnonymous');
    },
  },
});
</script>

<template>
  <q-page padding>
    <div class="text-h5">{{ greeting }}</div>
    <q-card flat bordered class="q-mt-md">
      <q-card-section class="text-body2 text-grey-7">
        <q-icon name="groups" size="sm" class="q-mr-sm" />
        {{ $t('home.groupsPlaceholder') }}
      </q-card-section>
    </q-card>
  </q-page>
</template>
