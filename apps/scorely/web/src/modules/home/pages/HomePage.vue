<script lang="ts">
import type { MyGroup } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { formatDateTime } from '@/lib/datetime';
import { useAuthStore } from '@/modules/auth/auth.store';
import { useGroupsStore } from '@/modules/groups/groups.store';
import { displayName } from '@/modules/users/user.display';

export default defineComponent({
  name: 'HomePage',

  setup() {
    return { auth: useAuthStore(), groups: useGroupsStore() };
  },

  computed: {
    greeting(): string {
      return this.auth.user
        ? this.$t('home.greeting', { name: displayName(this.auth.user) })
        : this.$t('home.greetingAnonymous');
    },
  },

  async mounted() {
    try {
      await this.groups.loadMine();
    } catch (err) {
      this.$q.notify({ type: 'negative', message: errorMessage(err) });
    }
  },

  methods: {
    when(iso: string): string {
      return formatDateTime(iso);
    },

    myPlace(g: MyGroup): string {
      if (!g.game.me) return '';
      return g.game.me.list === 'confirmed'
        ? this.$t('groups.youAreIn')
        : this.$t('groups.youAreWaiting', { position: g.game.me.position });
    },
  },
});
</script>

<template>
  <q-page padding>
    <div class="page">
      <div class="row items-center justify-between q-mb-md">
        <div class="text-h5">{{ greeting }}</div>
        <q-btn color="primary" icon="add" :label="$t('groups.create')" :to="{ name: 'group-create' }" />
      </div>

      <div class="text-subtitle1 q-mb-sm">{{ $t('home.myGroups') }}</div>
      <q-card v-if="groups.loaded && groups.mine.length === 0" flat bordered>
        <q-card-section class="text-body2 text-grey-7">
          <q-icon name="groups" size="sm" class="q-mr-sm" />
          {{ $t('home.noGroups') }}
        </q-card-section>
      </q-card>

      <q-list v-else bordered separator class="rounded-borders">
        <q-item v-for="g in groups.mine" :key="g.id" clickable :to="{ name: 'group', params: { id: g.id } }">
          <q-item-section>
            <q-item-label class="text-weight-medium">{{ g.name }}</q-item-label>
            <q-item-label caption>
              {{ $t('groups.game', { date: when(g.game.startsAt) }) }} · {{ $t(`gameStatus.${g.game.status}`) }}
            </q-item-label>
            <q-item-label v-if="g.game.me" caption class="text-primary">{{ myPlace(g) }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            {{ $t('groups.confirmedCount', { count: g.game.confirmedCount, slots: g.game.slots }) }}
          </q-item-section>
        </q-item>
      </q-list>
    </div>
  </q-page>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
}
</style>
