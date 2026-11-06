<script lang="ts">
import type { Game, Group, InviteKind, Member } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { formatDateTime } from '@/lib/datetime';
import { useAuthStore } from '../../auth/auth.store';
import GameCard from '../components/GameCard.vue';
import GroupLinksCard from '../components/GroupLinksCard.vue';
import LayersCard from '../components/LayersCard.vue';
import { groupsApi } from '../groups.api';

export default defineComponent({
  name: 'GroupPage',

  components: { GameCard, GroupLinksCard, LayersCard },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      group: undefined as Group | undefined,
      game: undefined as Game | undefined,
      members: [] as Member[],
      loadError: '',
      busy: false,
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
  },

  watch: {
    groupId: { immediate: true, handler: 'load' },
  },

  methods: {
    personName(p: Pick<Member, 'name'>): string {
      return p.name ?? this.$t('groups.unnamed');
    },

    async load() {
      this.loadError = '';
      try {
        const [group, game, members] = await Promise.all([
          groupsApi.get(this.groupId),
          groupsApi.currentGame(this.groupId),
          groupsApi.members(this.groupId),
        ]);
        this.group = group;
        this.game = game;
        this.members = members;
      } catch (err) {
        this.group = undefined;
        this.loadError = errorMessage(err);
      }
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

    async rotateInvite(kind: InviteKind) {
      if (!(await this.ask(this.$t('groups.rotateConfirm')))) return;
      await this.run(() => groupsApi.rotateInvite(this.groupId, kind), this.$t('groups.rotated'));
    },

    async removeMember(m: Member) {
      const key = m.role === 'reserve' ? 'groups.removeReserveConfirm' : 'groups.removeConfirm';
      if (!(await this.ask(this.$t(key, { name: this.personName(m) })))) return;
      await this.run(() => groupsApi.removeMember(this.groupId, m.userId), this.$t('groups.removed'));
    },
  },
});
</script>

<template>
  <q-page padding>
    <div class="page">
      <div v-if="loadError" class="q-mt-lg text-center">
        <div class="text-body1 q-mb-md">{{ loadError }}</div>
        <q-btn flat color="primary" :label="$t('groups.backHome')" :to="{ name: 'home' }" />
      </div>

      <template v-else-if="group && game">
        <div class="text-h5">{{ group.name }}</div>
        <div class="text-body2 text-grey-7 q-mb-md">
          {{ $t(`sports.${group.sport}`) }} ·
          {{ $t('groups.schedule', { weekday: $t(`weekdays.${group.weekday}`), time: group.time }) }}
          ({{ group.timeZone }})<span v-if="group.location"> · {{ group.location }}</span>
        </div>

        <GameCard
          class="q-mb-md"
          :game="game"
          :busy="busy"
          :can-cancel="canCancel"
          @confirm="confirm"
          @leave="leave"
          @cancel="cancel"
        />

        <LayersCard class="q-mb-md" :group="group" :game="game" :is-owner="isOwner" @saved="load" />

        <GroupLinksCard v-if="isOwner" class="q-mb-md" :group="group" :busy="busy" @rotate="rotateInvite" />

        <q-card flat bordered>
          <q-list>
            <q-item-label header>{{ $t('groups.members') }}</q-item-label>
            <q-item v-for="m in members" :key="m.userId">
              <q-item-section>
                <q-item-label>
                  {{ personName(m) }}
                  <span v-if="m.isOwner" class="text-caption text-grey-7">({{ $t('groups.owner') }})</span>
                  <span v-else-if="m.role === 'reserve'" class="text-caption text-grey-7">
                    ({{ $t('groups.roles.reserve') }})
                  </span>
                </q-item-label>
              </q-item-section>
              <q-item-section v-if="isOwner && !m.isOwner" side>
                <q-btn flat dense color="negative" :label="$t('groups.remove')" :disable="busy" @click="removeMember(m)" />
              </q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </template>

      <div v-else class="q-mt-lg text-center"><q-spinner size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
}
</style>
