<script lang="ts">
import type { GroupInviteV2, GroupMemberV2, GroupV2 } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import GroupV2InviteSheet from '@scorely/web/src/modules/groups-v2/components/GroupV2InviteSheet.vue';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { can } from '@scorely/web/src/modules/groups-v2/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-32: a tela Membros. Duas seções (Membros e Reservas), Convidar e Convites para quem tem `members.invite`,
 * Remover para quem tem `members.remove` e Sair do grupo para quem não é o dono.
 */
export default defineComponent({
  name: 'GroupV2MembersPage',

  components: { GroupV2InviteSheet },

  props: {
    group: { type: Object as PropType<GroupV2>, required: true },
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      members: [] as GroupMemberV2[],
      invites: [] as GroupInviteV2[],
      loaded: false,
      error: '',
      inviteOpen: false,
    };
  },

  computed: {
    canInvite(): boolean {
      return can(this.group, 'members.invite');
    },

    canRemove(): boolean {
      return can(this.group, 'members.remove');
    },

    full(): GroupMemberV2[] {
      return this.members.filter((m) => m.tier === 'member');
    },

    reserves(): GroupMemberV2[] {
      return this.members.filter((m) => m.tier === 'reserve');
    },

    activeInvites(): number {
      return this.invites.filter((i) => i.status === 'active').length;
    },

    isOwner(): boolean {
      return this.group.myRole === 'owner';
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    date(iso: string): string {
      return formatDateTime(iso, 'date');
    },

    /** GRV-32: "Convidar para membro" na reserva, para quem tem `members.invite`. */
    promotable(member: GroupMemberV2): boolean {
      return this.canInvite && member.tier === 'reserve';
    },

    async invitePromote(member: GroupMemberV2) {
      try {
        await groupsV2Api.createInvite(this.group.id, {
          tier: 'member',
          validityDays: 7,
          maxUses: null,
          target: { publicId: member.user.id },
        });
        await this.load();
        this.$q.notify({
          type: 'positive',
          message: this.$t('groupsV2.members.inviteSent', { name: member.user.nickname }),
        });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    /** GRV-32: Remover aparece em todas as linhas, menos a do dono e a própria. */
    removable(member: GroupMemberV2): boolean {
      return this.canRemove && member.role !== 'owner' && member.user.id !== this.auth.user?.id;
    },

    async load() {
      this.error = '';
      try {
        const [members, invites] = await Promise.all([
          groupsV2Api.members(this.group.id),
          this.canInvite ? groupsV2Api.invites(this.group.id) : Promise.resolve([]),
        ]);
        this.members = members;
        this.invites = invites;
      } catch (err) {
        this.error = errorMessage(err);
      } finally {
        this.loaded = true;
      }
    },

    openInvites() {
      this.$router.push({ name: 'group-v2-invites', params: { id: this.group.id } });
    },

    confirmRemove(member: GroupMemberV2) {
      this.$q
        .dialog({
          title: this.$t('groupsV2.members.removeTitle', { name: member.user.nickname }),
          message: this.$t('groupsV2.members.removeConfirm', { name: member.user.nickname }),
          cancel: { label: this.$t('groupsV2.cancel'), flat: true },
          ok: { label: this.$t('groupsV2.members.remove'), color: 'negative', flat: true },
        })
        .onOk(() => this.remove(member));
    },

    async remove(member: GroupMemberV2) {
      try {
        await groupsV2Api.removeMember(this.group.id, member.user.id);
        // GRV-37: o convite pelo qual a pessoa entrou, se ainda vale, pode ser cancelado no aviso.
        const invite = this.invites.find(
          (i) => i.status === 'active' && i.usedBy.some((u) => u.id === member.user.id),
        );
        await this.load();
        if (invite && this.canInvite) this.offerRevoke(member, invite);
        else this.$q.notify({ type: 'positive', message: this.$t('groupsV2.members.removed') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    offerRevoke(member: GroupMemberV2, invite: GroupInviteV2) {
      this.$q.notify({
        type: 'warning',
        timeout: 10000,
        message: this.$t('groupsV2.members.removedInvite', {
          name: member.user.nickname,
          creator: invite.createdBy.nickname,
        }),
        actions: [
          {
            label: this.$t('groupsV2.invites.revoke'),
            color: 'white',
            handler: () => this.revoke(invite),
          },
        ],
      });
    },

    async revoke(invite: GroupInviteV2) {
      try {
        await groupsV2Api.revokeInvite(this.group.id, invite.id);
        await this.load();
        this.$q.notify({ type: 'positive', message: this.$t('groupsV2.invites.revoked') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    confirmLeave() {
      this.$q
        .dialog({
          title: this.$t('groupsV2.members.leaveTitle'),
          message: this.$t('groupsV2.members.leaveConfirm', { name: this.group.name }),
          cancel: { label: this.$t('groupsV2.cancel'), flat: true },
          ok: { label: this.$t('groupsV2.members.leave'), color: 'negative', flat: true },
        })
        .onOk(() => this.leave());
    },

    async leave() {
      try {
        await groupsV2Api.leave(this.group.id);
        await this.$router.replace({ name: 'groups-v2' });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },
  },
});
</script>

<template>
  <div>
    <div v-if="canInvite" class="top">
      <q-btn
        color="primary"
        unelevated
        no-caps
        icon="person_add"
        class="sc-btn-main"
        :label="$t('groupsV2.members.invite')"
        @click="inviteOpen = true"
      />
      <button type="button" class="sc-card invites-row" @click="openInvites">
        <span class="sc-display">{{ $t('groupsV2.invites.title') }}</span>
        <span class="sc-caption">{{ $t('groupsV2.invites.active', { count: activeInvites }) }}</span>
        <q-icon name="chevron_right" size="22px" aria-hidden="true" />
      </button>
    </div>

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!loaded" class="loading"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <section v-for="part in [{ key: 'members', list: full }, { key: 'reserves', list: reserves }]" :key="part.key">
        <template v-if="part.list.length > 0">
          <h2 class="sc-section">{{ $t(`groupsV2.members.${part.key}`) }}</h2>
          <ul class="sc-card list">
            <li v-for="m in part.list" :key="m.user.id" class="member">
              <img v-if="m.user.avatarUrl" :src="m.user.avatarUrl" alt="" class="avatar" />
              <span v-else class="avatar sc-display" aria-hidden="true">{{ m.user.nickname.slice(0, 1).toUpperCase() }}</span>
              <span class="info">
                <span class="name">
                  {{ m.user.nickname }}
                  <q-badge v-if="m.role === 'owner'" color="primary" :label="$t('groupsV2.members.owner')" />
                </span>
                <span class="sc-caption">
                  {{ $t('groupsV2.members.since', { date: date(m.joinedAt) }) }}
                  <template v-if="m.invitedBy">
                    · {{ $t('groupsV2.members.invitedBy', { name: m.invitedBy.nickname }) }}
                  </template>
                </span>
              </span>
              <q-btn
                v-if="removable(m) || promotable(m)"
                flat
                round
                dense
                icon="more_vert"
                :aria-label="$t('groupsV2.members.actions', { name: m.user.nickname })"
              >
                <q-menu>
                  <q-list>
                    <q-item v-if="promotable(m)" v-close-popup clickable @click="invitePromote(m)">
                      <q-item-section>{{ $t('groupsV2.members.inviteAsMember') }}</q-item-section>
                    </q-item>
                    <q-item v-if="removable(m)" v-close-popup clickable @click="confirmRemove(m)">
                      <q-item-section class="text-negative">{{ $t('groupsV2.members.remove') }}</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </li>
          </ul>
        </template>
      </section>

      <q-btn
        v-if="!isOwner"
        flat
        no-caps
        color="negative"
        class="leave"
        :label="$t('groupsV2.members.leave')"
        @click="confirmLeave"
      />
    </template>

    <GroupV2InviteSheet v-model="inviteOpen" :group-id="group.id" @created="load" />
  </div>
</template>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}

.invites-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 12px 14px;
  border: 0;
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.invites-row .sc-caption {
  flex-grow: 1;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.member {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sc-line);
}

.member:last-child {
  border-bottom: 0;
}

.avatar {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: var(--sc-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
}

.info {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
}

.name {
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 8px;
}

.leave {
  margin-top: 24px;
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
