<script lang="ts">
import type { GroupInviteV2, GroupV2 } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { canShare, inviteUrl } from '@scorely/web/src/modules/groups-v2/invite-link';
import { can } from '@scorely/web/src/modules/groups-v2/nav';
import { copyToClipboard } from 'quasar';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-34: a lista de convites do grupo (GRV-19), um cartão por convite, os ativos primeiro. Só com `members.invite`:
 * para quem não tem, a rota leva aos Membros.
 */
export default defineComponent({
  name: 'GroupV2InvitesPage',

  props: {
    group: { type: Object as PropType<GroupV2>, required: true },
  },

  data() {
    return {
      invites: [] as GroupInviteV2[],
      loaded: false,
      error: '',
    };
  },

  computed: {
    canInvite(): boolean {
      return can(this.group, 'members.invite');
    },

    /** Os ativos vêm primeiro; dentro de cada grupo, a ordem da api (mais novo primeiro). */
    sorted(): GroupInviteV2[] {
      const active = this.invites.filter((i) => i.status === 'active');
      return [...active, ...this.invites.filter((i) => i.status !== 'active')];
    },

    shareable(): boolean {
      return canShare();
    },
  },

  mounted() {
    if (!this.canInvite) {
      this.$router.replace({ name: 'group-v2-members', params: { id: this.group.id } });
      return;
    }
    this.load();
  },

  methods: {
    async load() {
      this.error = '';
      try {
        this.invites = await groupsV2Api.invites(this.group.id);
      } catch (err) {
        this.error = errorMessage(err);
      } finally {
        this.loaded = true;
      }
    },

    date(iso: string): string {
      return formatDateTime(iso, 'dateTime');
    },

    /** "Membro · 7 dias · 3 de 10 usos" (GRV-34). */
    rules(invite: GroupInviteV2): string {
      const parts = [
        this.$t(`groupsV2.tier.${invite.tier}`),
        invite.expiresAt
          ? this.$t('groupsV2.invites.until', { date: this.date(invite.expiresAt) })
          : this.$t('groupsV2.invite.noExpiry'),
        invite.maxUses !== undefined
          ? this.$t('groupsV2.invites.usesOf', { uses: invite.uses, max: invite.maxUses })
          : invite.uses === 1
            ? this.$t('groupsV2.invites.oneUse')
            : this.$t('groupsV2.invites.uses', { count: invite.uses }),
      ];
      if (invite.target) {
        parts.push(
          'user' in invite.target
            ? this.$t('groupsV2.invites.forUser', { name: invite.target.user.nickname })
            : this.$t('groupsV2.invites.forEmail', { email: invite.target.email }),
        );
      }
      return parts.join(' · ');
    },

    async copy(invite: GroupInviteV2) {
      await copyToClipboard(inviteUrl(invite.token));
      this.$q.notify({ type: 'positive', message: this.$t('groupsV2.invite.copied') });
    },

    async share(invite: GroupInviteV2) {
      try {
        await navigator.share({ title: this.$t('groupsV2.invite.shareTitle'), url: inviteUrl(invite.token) });
      } catch {
        // a pessoa fechou o compartilhar: nada a fazer
      }
    },

    confirmRevoke(invite: GroupInviteV2) {
      this.$q
        .dialog({
          title: this.$t('groupsV2.invites.revokeTitle'),
          message: this.$t('groupsV2.invites.revokeConfirm'),
          cancel: { label: this.$t('groupsV2.cancel'), flat: true },
          ok: { label: this.$t('groupsV2.invites.revoke'), color: 'negative', flat: true },
        })
        .onOk(() => this.revoke(invite));
    },

    async revoke(invite: GroupInviteV2) {
      try {
        await groupsV2Api.revokeInvite(this.group.id, invite.id);
        this.$q.notify({ type: 'positive', message: this.$t('groupsV2.invites.revoked') });
        await this.load();
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },
  },
});
</script>

<template>
  <div v-if="canInvite">
    <h2 class="sc-section">{{ $t('groupsV2.invites.title') }}</h2>
    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!loaded" class="loading"><q-spinner color="primary" size="md" /></div>
    <div v-else-if="sorted.length === 0" class="sc-caption empty">{{ $t('groupsV2.invites.empty') }}</div>
    <ul v-else class="cards">
      <li v-for="invite in sorted" :key="invite.id" class="sc-card invite">
        <div class="head">
          <q-badge
            :color="invite.status === 'active' ? 'positive' : 'grey'"
            :label="$t(`groupsV2.invites.status.${invite.status}`)"
          />
          <span class="sc-display rules">{{ rules(invite) }}</span>
        </div>
        <div class="sc-caption">
          {{ $t('groupsV2.invites.createdBy', { name: invite.createdBy.nickname, date: date(invite.createdAt) }) }}
        </div>
        <div v-if="invite.usedBy.length > 0" class="sc-caption">
          {{ $t('groupsV2.invites.usedBy', { names: invite.usedBy.map((u) => u.nickname).join(', ') }) }}
        </div>
        <div v-if="invite.status === 'active'" class="actions">
          <q-btn flat no-caps dense icon="content_copy" :label="$t('groupsV2.invite.copy')" @click="copy(invite)" />
          <q-btn
            v-if="shareable"
            flat
            no-caps
            dense
            icon="share"
            :label="$t('groupsV2.invite.share')"
            @click="share(invite)"
          />
          <q-btn
            flat
            no-caps
            dense
            color="negative"
            icon="block"
            :label="$t('groupsV2.invites.revoke')"
            @click="confirmRevoke(invite)"
          />
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.cards {
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
  gap: 6px;
  padding: 14px;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rules {
  font-size: 18px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.error,
.empty {
  padding: 24px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
