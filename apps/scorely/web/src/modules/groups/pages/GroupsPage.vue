<script lang="ts">
import type { MyGroupInvite } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import GroupCover from '@scorely/web/src/modules/groups/components/GroupCover.vue';
import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { useGroupsStore } from '@scorely/web/src/modules/groups/groups.store';
import { defineComponent } from 'vue';

/** GRV-06: os meus grupos, em cards de capa (capa, logo sobreposto e nome). Sem grupo, só o botão "Criar grupo". */
export default defineComponent({
  name: 'GroupsPage',

  components: { GroupCover },

  setup() {
    return { groups: useGroupsStore() };
  },

  data() {
    return { invites: [] as MyGroupInvite[], busy: '' };
  },

  computed: {
    empty(): boolean {
      return this.groups.loaded && this.groups.mine.length === 0 && this.invites.length === 0;
    },
  },

  watch: {
    // Volta do painel de criar: relê a lista (o grupo novo entra no lugar certo da ordem, GRV-05).
    '$route.name'(name: unknown) {
      if (name === 'groups') this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    groupColor,
    initials,

    /** GRV-36: entrar pelo cartão usa o mesmo caminho do link (GRV-22) e leva à página do grupo. */
    async join(invite: MyGroupInvite) {
      this.busy = invite.id;
      try {
        const group = await groupsApi.joinInvite(invite.token);
        await this.$router.push({ name: 'group', params: { id: group.id } });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        await this.load();
      } finally {
        this.busy = '';
      }
    },

    async decline(invite: MyGroupInvite) {
      this.busy = invite.id;
      try {
        await groupsApi.declineInvite(invite.id);
        this.$q.notify({ type: 'positive', message: this.$t('groups.myInvites.declined') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = '';
        await this.load();
      }
    },

    async load() {
      try {
        const [, invites] = await Promise.all([this.groups.loadMine(), groupsApi.myInvites()]);
        this.invites = invites;
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
        <h1 class="sc-title title">{{ $t('groups.title') }}</h1>
        <q-btn
          v-if="groups.loaded && !empty"
          color="primary"
          unelevated
          icon="add"
          class="sc-btn-main"
          :label="$q.screen.xs ? undefined : $t('groups.create')"
          :aria-label="$t('groups.create')"
          :to="{ name: 'group-create' }"
        />
      </div>

      <section v-if="invites.length > 0" class="invites">
        <h2 class="sc-section">{{ $t('groups.myInvites.title') }}</h2>
        <ul class="invite-list">
          <li v-for="i in invites" :key="i.id" class="sc-card invite">
            <span class="invite-head">
              <img v-if="i.logoUrl" :src="i.logoUrl" alt="" class="invite-logo" />
              <span
                v-else
                class="sc-display invite-logo"
                :style="{ background: `var(--sc-group-${groupColor(i.groupId)})` }"
                aria-hidden="true"
                >{{ initials(i.name) }}</span
              >
              <span class="sc-display invite-name">{{ i.name }}</span>
            </span>
            <span class="sc-caption">
              {{ $t('groups.myInvites.invitedBy', { name: i.invitedBy.nickname }) }} ·
              {{ $t(`groups.tier.${i.tier}`) }} · {{ $t('groups.myInvites.participants', { count: i.participants }) }}
            </span>
            <span class="invite-actions">
              <q-btn
                flat
                no-caps
                class="sc-btn-outline"
                :label="$t('groups.myInvites.decline')"
                :disable="busy === i.id"
                @click="decline(i)"
              />
              <q-btn
                color="primary"
                unelevated
                no-caps
                class="sc-btn-main"
                :label="i.myTier ? $t('groups.myInvites.promote') : $t('groups.myInvites.join')"
                :loading="busy === i.id"
                @click="join(i)"
              />
            </span>
          </li>
        </ul>
      </section>

      <div v-if="empty" class="empty">
        <q-btn
          color="primary"
          unelevated
          icon="add"
          class="sc-btn-main"
          :class="{ 'full-width': $q.screen.xs }"
          :label="$t('groups.create')"
          :to="{ name: 'group-create' }"
        />
      </div>

      <div v-else-if="groups.loaded" class="grid">
        <router-link
          v-for="g in groups.mine"
          :key="g.id"
          :to="{ name: 'group', params: { id: g.id } }"
          class="sc-card card"
        >
          <GroupCover :group="g" />
          <span class="sc-display card-name">{{ g.name }}</span>
        </router-link>
      </div>

      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>

    <!-- /groups/new: o painel de criar grupo (GRV-07). -->
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

.invite-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.invite {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.invite-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.invite-logo {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  object-fit: cover;
}

.invite-name {
  font-size: 18px;
}

.invite-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
