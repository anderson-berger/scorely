<script lang="ts">
import type { Group, MyGroup } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import GroupCard from '@scorely/web/src/modules/groups/components/GroupCard.vue';
import {
  type GroupsTab,
  groupsTab,
  sortByNextGame,
  splitGroups,
} from '@scorely/web/src/modules/groups/groups';
import { useGroupsStore } from '@scorely/web/src/modules/groups/groups.store';
import { displayName } from '@scorely/web/src/modules/users/user.display';
import { defineComponent } from 'vue';

/** De quanto em quanto tempo as frases dos cards ("Abre …") se atualizam. */
const TICK_MS = 60_000;

interface TabOption {
  name: GroupsTab;
  label: string;
}

/**
 * Tela de Grupos (planos 013 e 014): abas Próximos jogos, Meus grupos e Participo, com cards em grade,
 * e Arquivados só quando houver algum (GRP-27).
 * A aba fica na query (`?tab=`) e trocar de aba não entra no histórico (014, D1).
 */
export default defineComponent({
  name: 'GroupsPage',

  components: { GroupCard },

  setup() {
    return { auth: useAuthStore(), groups: useGroupsStore() };
  },

  data() {
    return {
      now: new Date(),
      timer: undefined as ReturnType<typeof setInterval> | undefined,
    };
  },

  computed: {
    greeting(): string {
      return this.auth.user
        ? this.$t('groups.greeting', { name: displayName(this.auth.user) })
        : this.$t('groups.greetingAnonymous');
    },

    empty(): boolean {
      return this.groups.loaded && this.groups.mine.length === 0 && this.groups.archived.length === 0;
    },

    tab(): GroupsTab {
      return groupsTab(this.$route.query, this.groups.archived.length > 0);
    },

    split(): { owned: MyGroup[]; joined: MyGroup[] } {
      return splitGroups(sortByNextGame(this.groups.mine), this.auth.user?.id);
    },

    tabs(): TabOption[] {
      return [
        { name: 'next', label: this.$t('groups.tabs.next') },
        { name: 'owned', label: `${this.$t('groups.tabs.owned')} · ${this.split.owned.length}` },
        { name: 'joined', label: `${this.$t('groups.tabs.joined')} · ${this.split.joined.length}` },
        ...(this.groups.archived.length > 0
          ? [
              {
                name: 'archived' as const,
                label: `${this.$t('groups.tabs.archived')} · ${this.groups.archived.length}`,
              },
            ]
          : []),
      ];
    },

    shown(): (MyGroup | Group)[] {
      if (this.tab === 'archived') return this.groups.archived;
      if (this.tab === 'owned') return this.split.owned;
      if (this.tab === 'joined') return this.split.joined;
      return sortByNextGame(this.groups.mine);
    },

    emptyTab(): string {
      if (this.shown.length > 0) return '';
      if (this.tab === 'next') return this.$t('groups.emptyNext');
      return this.tab === 'owned' ? this.$t('groups.emptyOwned') : this.$t('groups.emptyJoined');
    },
  },

  async mounted() {
    this.timer = setInterval(() => {
      this.now = new Date();
    }, TICK_MS);
    try {
      await this.groups.loadMine();
    } catch (err) {
      this.$q.notify({ type: 'negative', message: errorMessage(err) });
    }
  },

  beforeUnmount() {
    clearInterval(this.timer);
  },

  methods: {
    selectTab(tab: GroupsTab) {
      const query = tab === 'next' ? {} : { tab };
      this.$router.replace({ name: 'groups', query });
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page page">
      <div class="head">
        <h1 class="sc-title title">{{ empty ? greeting : $t('nav.groups') }}</h1>
        <q-btn
          v-if="!empty"
          color="primary"
          unelevated
          icon="add"
          class="sc-btn-main new"
          :label="$q.screen.xs ? undefined : $t('groups.newGroup')"
          :aria-label="$t('groups.newGroup')"
          :to="{ name: 'group-create', query: $route.query }"
        />
      </div>

      <div v-if="empty" class="empty">
        <div class="sc-number zero" aria-hidden="true">0<span class="colon">:</span>0</div>
        <div class="sc-display empty-title">{{ $t('groups.empty') }}</div>
        <div class="empty-hint">{{ $t('groups.emptyHint') }}</div>
        <q-btn
          color="primary"
          unelevated
          icon="add"
          class="full-width sc-btn-main create"
          :label="$t('groups.create')"
          :to="{ name: 'group-create', query: $route.query }"
        />
        <div class="sc-caption text-center q-mt-sm">{{ $t('groups.gotLink') }}</div>
      </div>

      <template v-else-if="groups.loaded">
        <q-tabs
          :model-value="tab"
          dense
          no-caps
          align="left"
          active-color="primary"
          indicator-color="primary"
          class="tabs"
          @update:model-value="selectTab"
        >
          <q-tab v-for="t in tabs" :key="t.name" :name="t.name" :label="t.label" class="sc-display tab" />
        </q-tabs>

        <div v-if="emptyTab" class="sc-caption empty-tab">{{ emptyTab }}</div>
        <div v-else class="grid">
          <GroupCard v-for="g in shown" :key="g.id" :group="g" :now="now" />
        </div>
      </template>

      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>

    <!-- /groups/new: o painel de criar grupo (GRP-34). -->
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

.tabs {
  margin: 16px 0 20px;
  border-bottom: 1px solid var(--sc-line);
}

/* O Quasar põe o tamanho do texto no rótulo de dentro da aba, não na raiz. */
.tab {
  min-height: 44px;
}

.tab :deep(.q-tab__label) {
  font-size: 17px;
  letter-spacing: 1px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.empty-tab {
  padding: 24px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 480px;
  margin: 0 auto;
  padding: 40px 0;
}

.zero {
  font-size: 120px;
  color: var(--sc-line);
}

.zero .colon {
  color: var(--sc-line-strong);
}

.empty-title {
  font-size: 28px;
  margin-top: 16px;
}

.empty-hint {
  font-size: 15px;
  color: var(--sc-text-2);
  margin-top: 8px;
  max-width: 290px;
  line-height: 1.45;
}

.create {
  margin-top: 24px;
}
</style>
