<script lang="ts">
import { errorMessage } from '@scorely/web/src/i18n/errors';
import GroupV2Cover from '@scorely/web/src/modules/groups-v2/components/GroupV2Cover.vue';
import { useGroupsV2Store } from '@scorely/web/src/modules/groups-v2/groups-v2.store';
import { defineComponent } from 'vue';

/** GRV-06: os meus grupos, em cards de capa (capa, logo sobreposto e nome). Sem grupo, só o botão "Criar grupo". */
export default defineComponent({
  name: 'GroupsV2Page',

  components: { GroupV2Cover },

  setup() {
    return { groups: useGroupsV2Store() };
  },

  computed: {
    empty(): boolean {
      return this.groups.loaded && this.groups.mine.length === 0;
    },
  },

  watch: {
    // Volta do painel de criar: relê a lista (o grupo novo entra no lugar certo da ordem, GRV-05).
    '$route.name'(name: unknown) {
      if (name === 'groups-v2') this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    async load() {
      try {
        await this.groups.loadMine();
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page page">
      <div class="head">
        <h1 class="sc-title title">{{ $t('groupsV2.title') }}</h1>
        <q-btn
          v-if="groups.loaded && !empty"
          color="primary"
          unelevated
          icon="add"
          class="sc-btn-main new"
          :label="$q.screen.xs ? undefined : $t('groupsV2.create')"
          :aria-label="$t('groupsV2.create')"
          :to="{ name: 'group-v2-create' }"
        />
      </div>

      <div v-if="empty" class="empty">
        <q-btn
          color="primary"
          unelevated
          icon="add"
          class="full-width sc-btn-main"
          :label="$t('groupsV2.create')"
          :to="{ name: 'group-v2-create' }"
        />
      </div>

      <div v-else-if="groups.loaded" class="grid">
        <router-link
          v-for="g in groups.mine"
          :key="g.id"
          :to="{ name: 'group-v2', params: { id: g.id } }"
          class="sc-card card"
        >
          <GroupV2Cover :group="g" />
          <span class="sc-display card-name">{{ g.name }}</span>
        </router-link>
      </div>

      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>

    <!-- /v2/groups/new: o painel de criar grupo (GRV-07). -->
    <router-view />
  </q-page>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
}

.new {
  min-height: 44px;
  min-width: 44px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.card {
  display: block;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  border: 1px solid var(--sc-line);
  border-radius: 12px;
}

.card-name {
  display: block;
  padding: 0 16px 16px;
  font-size: 20px;
}

.empty {
  max-width: 480px;
  margin: 0 auto;
  padding: 40px 0;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
