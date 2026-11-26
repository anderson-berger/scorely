<script lang="ts">
import type { Group, GroupInvite, GroupJoinRequest, GroupMember, GroupTier } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { confirmAction } from '@scorely/web/src/lib/confirm';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import GroupInviteSheet from '@scorely/web/src/modules/groups/components/GroupInviteSheet.vue';
import GroupMemberRoleSheet from '@scorely/web/src/modules/groups/components/GroupMemberRoleSheet.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { can } from '@scorely/web/src/modules/groups/nav';
import { canTransfer, leaveMode, memberActions, roleMark } from '@scorely/web/src/modules/groups/roles';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-32: a tela Membros. Duas seções (Membros e Reservas); Convidar, Convites e Pedidos para quem tem `members.invite`;
 * Remover (`members.remove`) e Mudar cargo (`roles.manage`) nas linhas `manageable`, e Sair do grupo para quem não é o dono.
 */
export default defineComponent({
  name: 'GroupMembersPage',

  components: { GroupInviteSheet, GroupMemberRoleSheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: {
    /** O grupo como ficou depois de passar o grupo (GRV-49). */
    saved: (_group: Group) => true,
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      members: [] as GroupMember[],
      invites: [] as GroupInvite[],
      requests: [] as GroupJoinRequest[],
      tiers: ['member', 'reserve'] as GroupTier[],
      loaded: false,
      error: '',
      inviteOpen: false,
      roleOpen: false,
      roleMember: null as GroupMember | null,
    };
  },

  computed: {
    canInvite(): boolean {
      return can(this.group, 'members.invite');
    },

    full(): GroupMember[] {
      return this.members.filter((m) => m.tier === 'member');
    },

    reserves(): GroupMember[] {
      return this.members.filter((m) => m.tier === 'reserve');
    },

    activeInvites(): number {
      return this.invites.filter((i) => i.status === 'active').length;
    },

    mustTransferFirst(): boolean {
      return leaveMode(this.group) === 'transferFirst';
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
    promotable(member: GroupMember): boolean {
      return this.canInvite && member.tier === 'reserve';
    },

    async invitePromote(member: GroupMember) {
      try {
        // A validade fica de fora: a api usa o padrão (GRV-18, 32). O convite pessoal tem sempre 1 uso (GRV-23).
        await groupsApi.createInvite(this.group.id, {
          tier: 'member',
          target: { publicId: member.user.id },
        });
        await this.load();
        this.$q.notify({
          type: 'positive',
          message: this.$t('groups.members.inviteSent', { name: member.user.nickname }),
        });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    /** GRV-32, 43: Remover e Mudar cargo aparecem nas linhas que a api marca como `manageable` (abaixo do meu cargo), menos a própria. */
    actions(member: GroupMember): ('remove' | 'changeRole')[] {
      return member.user.id === this.auth.user?.id ? [] : memberActions(this.group, member);
    },

    /** GRV-32: a marca do cargo na linha ("Dono" ou o nome do cargo criado). */
    mark(member: GroupMember): string {
      const mark = roleMark(member.role);
      if (!mark) return '';
      return mark.kind === 'owner' ? this.$t('groups.members.owner') : mark.name;
    },

    /** GRV-49, 32: "Passar o grupo" no menu de um membro, só para o Dono. */
    transferable(member: GroupMember): boolean {
      return canTransfer(this.group, member);
    },

    async confirmTransfer(member: GroupMember) {
      const confirmed = await confirmAction({
        title: this.$t('groups.members.transferTitle', { name: member.user.nickname }),
        message: this.$t('groups.members.transferConfirm', { name: member.user.nickname }),
        ok: this.$t('groups.members.transfer'),
        cancel: this.$t('groups.cancel'),
        danger: true,
      });
      if (!confirmed) return;
      await this.transfer(member);
    },

    /** GRV-49: passa o grupo e relê o grupo (o `myRole` e as permissões mudaram) e a lista. */
    async transfer(member: GroupMember) {
      try {
        await groupsApi.transfer(this.group.id, { userPublicId: member.user.id });
        this.$emit('saved', await groupsApi.get(this.group.id));
        await this.load();
        this.$q.notify({ type: 'positive', message: this.$t('groups.members.transferred') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    changeRole(member: GroupMember) {
      this.roleMember = member;
      this.roleOpen = true;
    },

    async load() {
      this.error = '';
      try {
        const [members, invites, requests] = await Promise.all([
          groupsApi.members(this.group.id),
          this.canInvite ? groupsApi.invites(this.group.id) : Promise.resolve([]),
          this.canInvite ? groupsApi.requests(this.group.id) : Promise.resolve([]),
        ]);
        this.members = members;
        this.invites = invites;
        this.requests = requests;
      } catch (err) {
        this.error = errorMessage(err);
      } finally {
        this.loaded = true;
      }
    },

    /** GRV-28: aceitar, escolhendo membro ou reserva. */
    async approve(request: GroupJoinRequest, tier: GroupTier) {
      try {
        await groupsApi.approveRequest(this.group.id, request.user.id, { tier });
        this.$q.notify({
          type: 'positive',
          message: this.$t('groups.requests.approved', { name: request.user.nickname }),
        });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
      await this.load();
    },

    async confirmDecline(request: GroupJoinRequest) {
      const confirmed = await confirmAction({
        title: this.$t('groups.requests.declineTitle', { name: request.user.nickname }),
        message: this.$t('groups.requests.declineConfirm', { name: request.user.nickname }),
        ok: this.$t('groups.requests.decline'),
        cancel: this.$t('groups.cancel'),
        danger: true,
      });
      if (!confirmed) return;
      await this.decline(request);
    },

    /** GRV-28: recusar, sem aviso para a pessoa. */
    async decline(request: GroupJoinRequest) {
      try {
        await groupsApi.declineRequest(this.group.id, request.user.id);
        this.$q.notify({ type: 'positive', message: this.$t('groups.requests.declined') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
      await this.load();
    },

    openInvites() {
      this.$router.push({ name: 'group-invites', params: { id: this.group.id } });
    },

    async confirmRemove(member: GroupMember) {
      const confirmed = await confirmAction({
        title: this.$t('groups.members.removeTitle', { name: member.user.nickname }),
        message: this.$t('groups.members.removeConfirm', { name: member.user.nickname }),
        ok: this.$t('groups.members.remove'),
        cancel: this.$t('groups.cancel'),
        danger: true,
      });
      if (!confirmed) return;
      await this.remove(member);
    },

    async remove(member: GroupMember) {
      try {
        await groupsApi.removeMember(this.group.id, member.user.id);
        // GRV-37: o convite da participação (o último pelo qual entrou ou subiu), se ainda vale, pode ser cancelado no aviso.
        const invite = this.invites.find((i) => i.status === 'active' && i.id === member.inviteId);
        await this.load();
        if (invite && this.canInvite) this.offerRevoke(member, invite);
        else this.$q.notify({ type: 'positive', message: this.$t('groups.members.removed') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    offerRevoke(member: GroupMember, invite: GroupInvite) {
      this.$q.notify({
        type: 'warning',
        timeout: 10000,
        message: this.$t('groups.members.removedInvite', {
          name: member.user.nickname,
          creator: invite.createdBy.nickname,
        }),
        actions: [
          {
            label: this.$t('groups.invites.revoke'),
            color: 'white',
            handler: () => this.revoke(invite),
          },
        ],
      });
    },

    async revoke(invite: GroupInvite) {
      try {
        await groupsApi.revokeInvite(this.group.id, invite.id);
        await this.load();
        this.$q.notify({ type: 'positive', message: this.$t('groups.invites.revoked') });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    async confirmLeave() {
      const confirmed = await confirmAction({
        title: this.$t('groups.members.leaveTitle'),
        message: this.$t('groups.members.leaveConfirm', { name: this.group.name }),
        ok: this.$t('groups.members.leave'),
        cancel: this.$t('groups.cancel'),
        danger: true,
      });
      if (!confirmed) return;
      await this.leave();
    },

    async leave() {
      try {
        await groupsApi.leave(this.group.id);
        await this.$router.replace({ name: 'groups' });
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
        class="sc-btn-main invite"
        :label="$t('groups.members.invite')"
        @click="inviteOpen = true"
      />
      <button type="button" class="sc-card invites-row" @click="openInvites">
        <span class="sc-display">{{ $t('groups.invites.title') }}</span>
        <span class="sc-caption">{{ $t('groups.invites.active', { count: activeInvites }) }}</span>
        <q-icon name="chevron_right" size="22px" aria-hidden="true" />
      </button>
    </div>

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!loaded" class="loading"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <section v-if="requests.length > 0">
        <h2 class="sc-section">{{ $t('groups.requests.title') }}</h2>
        <ul class="sc-card list">
          <li v-for="r in requests" :key="r.user.id" class="member">
            <img v-if="r.user.avatarUrl" :src="r.user.avatarUrl" alt="" class="avatar" />
            <span v-else class="avatar sc-display" aria-hidden="true">{{ r.user.nickname.slice(0, 1).toUpperCase() }}</span>
            <span class="info">
              <span class="name">{{ r.user.nickname }}</span>
              <span class="sc-caption">{{ $t('groups.requests.since', { date: date(r.createdAt) }) }}</span>
            </span>
            <q-btn-dropdown
              color="primary"
              unelevated
              no-caps
              dense
              :label="$t('groups.requests.approve')"
              :aria-label="$t('groups.requests.actions', { name: r.user.nickname })"
            >
              <q-list>
                <q-item-label header>{{ $t('groups.requests.approveAs') }}</q-item-label>
                <q-item v-for="t in tiers" :key="t" v-close-popup clickable @click="approve(r, t)">
                  <q-item-section>{{ $t(`groups.tier.${t}`) }}</q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
            <q-btn flat no-caps dense color="negative" :label="$t('groups.requests.decline')" @click="confirmDecline(r)" />
          </li>
        </ul>
      </section>

      <section v-for="part in [{ key: 'members', list: full }, { key: 'reserves', list: reserves }]" :key="part.key">
        <template v-if="part.list.length > 0">
          <h2 class="sc-section">{{ $t(`groups.members.${part.key}`) }}</h2>
          <ul class="sc-card list">
            <li v-for="m in part.list" :key="m.user.id" class="member">
              <img v-if="m.user.avatarUrl" :src="m.user.avatarUrl" alt="" class="avatar" />
              <span v-else class="avatar sc-display" aria-hidden="true">{{ m.user.nickname.slice(0, 1).toUpperCase() }}</span>
              <span class="info">
                <span class="name">
                  {{ m.user.nickname }}
                  <q-badge v-if="mark(m)" :color="m.role.id === 'owner' ? 'primary' : 'grey'" :label="mark(m)" />
                </span>
                <span class="sc-caption">
                  {{ $t('groups.members.since', { date: date(m.joinedAt) }) }}
                  <template v-if="m.invitedBy">
                    · {{ $t('groups.members.invitedBy', { name: m.invitedBy.nickname }) }}
                  </template>
                </span>
              </span>
              <q-btn
                v-if="actions(m).length > 0 || promotable(m) || transferable(m)"
                flat
                round
                dense
                icon="more_vert"
                :aria-label="$t('groups.members.actions', { name: m.user.nickname })"
              >
                <q-menu>
                  <q-list>
                    <q-item v-if="promotable(m)" v-close-popup clickable @click="invitePromote(m)">
                      <q-item-section>{{ $t('groups.members.inviteAsMember') }}</q-item-section>
                    </q-item>
                    <q-item v-if="transferable(m)" v-close-popup clickable @click="confirmTransfer(m)">
                      <q-item-section>{{ $t('groups.members.transfer') }}</q-item-section>
                    </q-item>
                    <q-item v-if="actions(m).includes('changeRole')" v-close-popup clickable @click="changeRole(m)">
                      <q-item-section>{{ $t('groups.members.changeRole') }}</q-item-section>
                    </q-item>
                    <q-item v-if="actions(m).includes('remove')" v-close-popup clickable @click="confirmRemove(m)">
                      <q-item-section class="text-negative">{{ $t('groups.members.remove') }}</q-item-section>
                    </q-item>
                  </q-list>
                </q-menu>
              </q-btn>
            </li>
          </ul>
        </template>
      </section>

      <p v-if="mustTransferFirst" class="leave-hint">{{ $t('groups.members.ownerCannotLeave') }}</p>
      <q-btn
        v-else
        flat
        no-caps
        color="negative"
        class="leave"
        :label="$t('groups.members.leave')"
        @click="confirmLeave"
      />
    </template>

    <GroupInviteSheet v-model="inviteOpen" :group-id="group.id" @created="load" />
    <GroupMemberRoleSheet v-model="roleOpen" :group="group" :member="roleMember" @changed="load" />
  </div>
</template>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}

/* A partir de 600px, "Convidar" fica no topo à direita, do tamanho do texto. */
@media (min-width: 600px) {
  .invite {
    align-self: flex-end;
  }
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

.leave-hint {
  margin: 16px 0 0;
  text-align: center;
  color: var(--sc-text-muted, inherit);
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
