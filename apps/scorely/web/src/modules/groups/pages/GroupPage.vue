<script lang="ts">
import type { Game, Group, InviteKind, Member, Player, PlayerPosition } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { currentTimeZone, formatDateTime } from '@scorely/web/src/lib/datetime';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import GroupHero from '@scorely/web/src/modules/groups/components/GroupHero.vue';
import { gameUnlessArchived } from '@scorely/web/src/modules/groups/groups';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import {
  type GroupTab,
  groupTabs,
  showGroupTimeZone,
  tabRedirect,
} from '@scorely/web/src/modules/groups/tabs';
import PlayerPositionsSheet from '@scorely/web/src/modules/teams/components/PlayerPositionsSheet.vue';
import { positionsByUser, sportPositions } from '@scorely/web/src/modules/teams/players';
import { teamsApi } from '@scorely/web/src/modules/teams/teams.api';
import { defineComponent } from 'vue';

const TAB_LABELS: Record<GroupTab, string> = {
  group: 'groups.tabs.game',
  'group-teams': 'groups.tabs.teams',
  'group-members': 'groups.tabs.members',
  'group-settings': 'groups.tabs.settings',
};

/**
 * Casco da página do grupo (planos 012 e 015): carrega grupo, jogo e membros, mostra a capa do grupo
 * e as abas fixas, e concentra as ações. Cada aba é uma rota filha que recebe os dados por props e devolve eventos (D2).
 * Grupo arquivado (GRP-37): sem jogo, com a faixa no topo; um `GROUP_ARCHIVED` numa ação recarrega a página pelo `run()`.
 */
export default defineComponent({
  name: 'GroupPage',

  components: { GroupHero, PlayerPositionsSheet },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      group: undefined as Group | undefined,
      /** `null`: grupo arquivado, sem jogo (GRP-37). `undefined`: ainda carregando. */
      game: undefined as Game | null | undefined,
      members: [] as Member[],
      loadError: '',
      busy: false,
      /** Posições de cada pessoa (TIM-03, 05): todos do grupo, em esporte com posições. */
      players: [] as Player[],
      editingPlayer: undefined as Player | undefined,
      positionsOpen: false,
    };
  },

  computed: {
    groupId(): string {
      return String(this.$route.params.id);
    },

    isOwner(): boolean {
      return Boolean(this.group && this.group.ownerId === this.auth.user?.id);
    },

    canCancel(): boolean {
      return this.isOwner && (this.game?.status === 'open' || this.game?.status === 'scheduled');
    },

    /** GRP-44: o dono reabre o jogo cancelado, só antes do início. */
    canReopen(): boolean {
      const g = this.game;
      return this.isOwner && g?.status === 'cancelled' && Date.parse(g.startsAt) > Date.now();
    },

    /** TIM-03, 05: todos do grupo veem as posições, só em esporte que tem posições. */
    showsPositions(): boolean {
      return Boolean(this.group && sportPositions(this.group.sport).length > 0);
    },

    /** TIM-03, 05: só o dono muda; no grupo arquivado, as posições aparecem mas o painel não abre (GRP-37). */
    canEditPositions(): boolean {
      return this.showsPositions && this.isOwner && !this.group?.archivedAt;
    },

    playerPositions(): Record<string, PlayerPosition[]> | undefined {
      return this.showsPositions ? positionsByUser(this.players) : undefined;
    },

    /** GRP-29: o nome da aba não leva contagem; as contagens ficam nas seções de dentro. */
    tabs(): { name: GroupTab; label: string }[] {
      return groupTabs(this.isOwner).map((name) => ({ name, label: this.$t(TAB_LABELS[name]) }));
    },

    /** A aba marcada: o nome da rota filha. */
    activeTab(): string {
      return String(this.$route.name);
    },

    /** GRP-29/41: a reserva com convite pendente vê a faixa para aceitar ou recusar. */
    memberInviteBanner(): string {
      const invite = this.group?.archivedAt ? undefined : this.group?.myMemberInvite;
      return invite ? this.$t('groups.memberInvite.banner', { date: formatDateTime(invite.expiresAt) }) : '';
    },

    /** GRP-37: "Grupo arquivado em {data}", ou vazio quando o grupo está ativo. */
    archivedBanner(): string {
      const at = this.group?.archivedAt;
      return at ? this.$t('groups.archivedBanner', { date: formatDateTime(at) }) : '';
    },

    /** O fuso só aparece quando é diferente do de quem vê (D8). */
    showTimeZone(): boolean {
      return Boolean(this.group && showGroupTimeZone(this.group.timeZone, currentTimeZone()));
    },
  },

  watch: {
    groupId: { immediate: true, handler: 'load' },
    '$route.name': 'guardTab',
  },

  methods: {
    /** Passa a altura do cabeçalho fixo para as abas grudarem logo abaixo dele (D3). */
    pageStyle(offset: number, height: number): Record<string, string> {
      return { minHeight: `${height - offset}px`, '--sc-sticky-top': `${offset}px` };
    },

    async load() {
      this.loadError = '';
      try {
        const [group, game, members] = await Promise.all([
          groupsApi.get(this.groupId),
          gameUnlessArchived(() => groupsApi.currentGame(this.groupId)),
          groupsApi.members(this.groupId),
        ]);
        this.group = group;
        this.game = game;
        this.members = members;
        this.players = this.showsPositions ? await this.loadPlayers() : [];
        await this.guardTab();
      } catch (err) {
        this.group = undefined;
        this.loadError = errorMessage(err);
      }
    },

    /** TIM-05: sem as posições a página continua funcionando; elas só não aparecem. */
    async loadPlayers(): Promise<Player[]> {
      try {
        return await teamsApi.players(this.groupId);
      } catch {
        return [];
      }
    },

    /** Quem não é dono e abriu o Ajustes cai no Jogo (D4). */
    async guardTab() {
      if (!this.group) return;
      const to = tabRedirect(String(this.$route.name), this.isOwner);
      if (to) await this.$router.replace({ name: to, params: { id: this.groupId } });
    },

    openTab(name: GroupTab) {
      if (name !== this.$route.name) void this.$router.push({ name, params: { id: this.groupId } });
    },

    /** Pergunta antes de uma ação que avisa ou afeta outras pessoas. */
    ask(message: string): Promise<boolean> {
      return new Promise((resolve) => {
        this.$q
          .dialog({
            message,
            cancel: { label: this.$t('groups.no'), flat: true },
            ok: { label: this.$t('groups.yes'), color: 'primary' },
            persistent: true,
          })
          .onOk(() => resolve(true))
          .onCancel(() => resolve(false));
      });
    },

    /** Roda uma ação, mostra o erro traduzido e recarrega a página. */
    async run(action: () => Promise<unknown>, success?: string) {
      this.busy = true;
      try {
        await action();
        if (success) this.$q.notify({ type: 'positive', message: success });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = false;
        await this.load();
      }
    },

    async confirm() {
      if (this.game) await this.run(() => groupsApi.confirm(this.groupId, this.game?.date ?? ''));
    },

    async leave() {
      if (this.game) await this.run(() => groupsApi.leave(this.groupId, this.game?.date ?? ''));
    },

    async cancel() {
      if (!this.game) return;
      const date = formatDateTime(this.game.startsAt);
      if (!(await this.ask(this.$t('groups.cancelConfirm', { date })))) return;
      await this.run(() => groupsApi.cancel(this.groupId, this.game?.date ?? ''));
    },

    /** GRP-44: confirma antes, porque avisa a lista. */
    async reopen() {
      if (!this.game) return;
      const date = formatDateTime(this.game.startsAt);
      if (!(await this.ask(this.$t('groups.reopenConfirm', { date })))) return;
      await this.run(() => groupsApi.reopen(this.groupId, this.game?.date ?? ''), this.$t('groups.reopened'));
    },

    /** GRP-29: confirma antes; a página continua aberta, agora arquivada (GRP-37). */
    async archive() {
      if (!(await this.ask(this.$t('groups.settings.archiveConfirm')))) return;
      await this.run(() => groupsApi.archive(this.groupId), this.$t('groups.archivedToast'));
    },

    /** GRP-37: sem confirmação, não se perde nada (GRP-33). */
    async unarchive() {
      await this.run(() => groupsApi.unarchive(this.groupId), this.$t('groups.unarchivedToast'));
    },

    async rotateInvite(kind: InviteKind) {
      if (!(await this.ask(this.$t('groups.rotateConfirm')))) return;
      await this.run(() => groupsApi.rotateInvite(this.groupId, kind), this.$t('groups.rotated'));
    },

    /** GRP-40: o dono convida a reserva; ela recebe o aviso. */
    async inviteToMember(m: Member) {
      await this.run(
        () => groupsApi.inviteToMember(this.groupId, m.userId),
        this.$t('groups.memberInvite.sentToast', { name: m.name ?? this.$t('groups.unnamed') }),
      );
    },

    async cancelMemberInvite(m: Member) {
      await this.run(
        () => groupsApi.cancelMemberInvite(this.groupId, m.userId),
        this.$t('groups.memberInvite.cancelledToast'),
      );
    },

    /** GRP-41: ao aceitar, a página recarrega com o papel novo. */
    async acceptMemberInvite() {
      await this.run(
        () => groupsApi.acceptMemberInvite(this.groupId),
        this.$t('groups.memberInvite.acceptedToast'),
      );
    },

    async declineMemberInvite() {
      await this.run(
        () => groupsApi.declineMemberInvite(this.groupId),
        this.$t('groups.memberInvite.declinedToast'),
      );
    },

    /** GRP-43: confirma e vai para /groups (a página deixa de abrir para quem saiu). */
    async leaveGroup() {
      if (!(await this.ask(this.$t('groups.leaveGroupConfirm')))) return;
      this.busy = true;
      try {
        await groupsApi.leaveGroup(this.groupId);
        this.$q.notify({ type: 'positive', message: this.$t('groups.leftGroup') });
        await this.$router.push({ name: 'groups' });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        await this.load();
      } finally {
        this.busy = false;
      }
    },

    /** TIM-05: abre o painel "Posições" da pessoa tocada na lista. */
    editPlayer(userId: string) {
      const player = this.players.find((p) => p.userId === userId);
      if (!this.canEditPositions || !player) return;
      this.editingPlayer = player;
      this.positionsOpen = true;
    },

    onPlayerSaved(saved: Player) {
      this.players = this.players.map((p) => (p.userId === saved.userId ? saved : p));
    },

    async removeMember(m: Member) {
      const name = m.name ?? this.$t('groups.unnamed');
      const key = m.role === 'reserve' ? 'groups.removeReserveConfirm' : 'groups.removeConfirm';
      if (!(await this.ask(this.$t(key, { name })))) return;
      await this.run(() => groupsApi.removeMember(this.groupId, m.userId), this.$t('groups.removed'));
    },
  },
});
</script>

<template>
  <q-page :style-fn="pageStyle">
    <div class="sc-page">
      <div v-if="loadError" class="state">
        <div class="state-text">{{ loadError }}</div>
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.backToGroups')" :to="{ name: 'groups' }" />
      </div>

      <template v-else-if="group && game !== undefined">
        <GroupHero :group="group" :game="game" :show-time-zone="showTimeZone" />

        <div v-if="archivedBanner" class="sc-card archived-banner" role="status">
          <q-icon name="inventory_2" size="20px" aria-hidden="true" />
          <span>{{ archivedBanner }}</span>
        </div>

        <div v-if="memberInviteBanner" class="sc-card invite-banner" role="status">
          <div class="invite-text">
            <q-icon name="how_to_reg" size="20px" aria-hidden="true" />
            <span>{{ memberInviteBanner }}</span>
          </div>
          <div class="invite-actions">
            <q-btn
              flat
              no-caps
              class="sc-btn-outline"
              :label="$t('groups.memberInvite.decline')"
              :disable="busy"
              @click="declineMemberInvite"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              class="sc-btn-main"
              :label="$t('groups.memberInvite.accept')"
              :loading="busy"
              @click="acceptMemberInvite"
            />
          </div>
        </div>

        <nav class="tabs-bar">
          <q-tabs
            dense
            no-caps
            :align="$q.screen.gt.sm ? 'left' : 'justify'"
            active-color="primary"
            indicator-color="primary"
            class="tabs"
            :model-value="activeTab"
            @update:model-value="openTab"
          >
            <q-tab v-for="t in tabs" :key="t.name" :name="t.name" :label="t.label" class="sc-display tab" />
          </q-tabs>
        </nav>

        <PlayerPositionsSheet
          v-if="canEditPositions && group"
          v-model="positionsOpen"
          :group-id="groupId"
          :sport="group.sport"
          :player="editingPlayer"
          @saved="onPlayerSaved"
        />

        <router-view v-slot="{ Component }">
          <component
            :is="Component"
            :group="group"
            :game="game"
            :members="members"
            :busy="busy"
            :is-owner="isOwner"
            :can-cancel="canCancel"
            :can-reopen="canReopen"
            :player-positions="playerPositions"
            :can-edit-positions="canEditPositions"
            @edit-player="editPlayer"
            @confirm="confirm"
            @leave="leave"
            @cancel="cancel"
            @reopen="reopen"
            @rotate="rotateInvite"
            @remove="removeMember"
            @member-invite="inviteToMember"
            @cancel-member-invite="cancelMemberInvite"
            @leave-group="leaveGroup"
            @archive="archive"
            @unarchive="unarchive"
            @saved="load"
          />
        </router-view>
      </template>

      <div v-else class="state"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.state {
  margin-top: 48px;
  text-align: center;
}

.state-text {
  font-size: 16px;
  margin-bottom: 16px;
}

/* GRP-37: a faixa do grupo arquivado, logo abaixo do topo. */
.archived-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  padding: 12px 14px;
  font-size: 14px;
  color: var(--sc-text-2);
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

/* Abas presas logo abaixo do cabeçalho fixo (D3). */
.tabs-bar {
  position: sticky;
  top: var(--sc-sticky-top, 0);
  z-index: 1;
  margin: 16px -16px 20px;
  padding: 0 16px;
  background: var(--sc-bg);
  border-bottom: 1px solid var(--sc-line);
}

@media (min-width: 1024px) {
  .tabs-bar {
    margin: 0 0 24px;
    padding: 0 8px;
  }

  /* Abas maiores no desktop (plano 015, D19). O padding de 16px de cada aba já dá 32px entre os rótulos. */
  .tabs-bar .tab :deep(.q-tab__label) {
    font-size: 18px;
  }
}

/* O Quasar põe o tamanho do texto no rótulo de dentro da aba, não na raiz. */
.tab {
  min-height: 44px;
}

.tab :deep(.q-tab__label) {
  font-size: 16px;
  letter-spacing: 1px;
}

.invite-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
  padding: 12px 14px;
  margin-top: 12px;
  border-color: var(--sc-accent);
}

.invite-text {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.invite-actions {
  display: flex;
  gap: 8px;
}
</style>
