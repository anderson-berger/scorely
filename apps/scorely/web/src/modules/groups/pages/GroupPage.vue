<script lang="ts">
import type { Attendee, Game, Group, Member } from '@scorely/contracts';
import { copyToClipboard } from 'quasar';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { formatDateTime } from '@/lib/datetime';
import { useAuthStore } from '../../auth/auth.store';
import { groupsApi } from '../groups.api';

export default defineComponent({
  name: 'GroupPage',

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

    inviteUrl(): string {
      return this.group?.inviteToken ? `${window.location.origin}/join/${this.group.inviteToken}` : '';
    },

    canChangeList(): boolean {
      return this.game?.status === 'open';
    },

    canCancel(): boolean {
      return this.isOwner && (this.game?.status === 'open' || this.game?.status === 'scheduled');
    },
  },

  watch: {
    groupId: { immediate: true, handler: 'load' },
  },

  methods: {
    when(iso: string): string {
      return formatDateTime(iso);
    },

    personName(p: Pick<Attendee, 'name'>): string {
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
      if (!(await this.ask(this.$t('groups.cancelConfirm', { date: this.when(this.game.startsAt) })))) return;
      await this.run(() => groupsApi.cancel(this.groupId, this.game?.date ?? ''));
    },

    async copyInvite() {
      await copyToClipboard(this.inviteUrl);
      this.$q.notify({ type: 'positive', message: this.$t('groups.copied') });
    },

    async rotateInvite() {
      if (!(await this.ask(this.$t('groups.rotateConfirm')))) return;
      await this.run(() => groupsApi.rotateInvite(this.groupId), this.$t('groups.rotated'));
    },

    async removeMember(m: Member) {
      if (!(await this.ask(this.$t('groups.removeConfirm', { name: this.personName(m) })))) return;
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

        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="row items-center justify-between">
              <div class="text-subtitle1 text-weight-medium">{{ $t('groups.game', { date: when(game.startsAt) }) }}</div>
              <q-chip dense :color="game.status === 'cancelled' ? 'red-2' : 'blue-1'">
                {{ $t(`gameStatus.${game.status}`) }}
              </q-chip>
            </div>
            <div v-if="game.status === 'scheduled'" class="text-body2 text-grey-7">
              {{ $t('groups.opensAt', { date: when(game.opensAt) }) }}
            </div>
            <div class="text-body2 q-mt-xs">
              {{ $t('groups.confirmedCount', { count: game.confirmed.length, slots: game.slots }) }}
            </div>
            <div v-if="game.me" class="text-body2 text-primary">
              {{
                game.me.list === 'confirmed'
                  ? $t('groups.youAreIn')
                  : $t('groups.youAreWaiting', { position: game.me.position })
              }}
            </div>
          </q-card-section>

          <q-card-actions>
            <q-btn
              v-if="canChangeList && !game.me"
              color="primary"
              :label="$t('groups.confirm')"
              :loading="busy"
              @click="confirm"
            />
            <q-btn v-if="canChangeList && game.me" flat :label="$t('groups.leave')" :loading="busy" @click="leave" />
            <q-space />
            <q-btn v-if="canCancel" flat color="negative" :label="$t('groups.cancelGame')" :disable="busy" @click="cancel" />
          </q-card-actions>

          <q-separator />
          <q-list dense>
            <q-item-label header>{{ $t('groups.confirmed') }}</q-item-label>
            <q-item v-for="(a, i) in game.confirmed" :key="a.userId">
              <q-item-section avatar>{{ i + 1 }}</q-item-section>
              <q-item-section>{{ personName(a) }}</q-item-section>
            </q-item>
            <q-item v-if="game.confirmed.length === 0">
              <q-item-section class="text-grey-7">{{ $t('groups.emptyList') }}</q-item-section>
            </q-item>
            <template v-if="game.waitlist.length > 0">
              <q-item-label header>{{ $t('groups.waitlist') }}</q-item-label>
              <q-item v-for="(a, i) in game.waitlist" :key="a.userId">
                <q-item-section avatar>{{ i + 1 }}</q-item-section>
                <q-item-section>{{ personName(a) }}</q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-card>

        <q-card v-if="isOwner && inviteUrl" flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle1 text-weight-medium">{{ $t('groups.invite') }}</div>
            <div class="text-caption text-grey-7 q-mb-sm">{{ $t('groups.inviteHint') }}</div>
            <q-input :model-value="inviteUrl" readonly dense outlined />
          </q-card-section>
          <q-card-actions>
            <q-btn flat icon="content_copy" :label="$t('groups.copy')" @click="copyInvite" />
            <q-btn flat icon="autorenew" :label="$t('groups.rotate')" :disable="busy" @click="rotateInvite" />
          </q-card-actions>
        </q-card>

        <q-card flat bordered>
          <q-list>
            <q-item-label header>{{ $t('groups.members') }}</q-item-label>
            <q-item v-for="m in members" :key="m.userId">
              <q-item-section>
                <q-item-label>
                  {{ personName(m) }}
                  <span v-if="m.isOwner" class="text-caption text-grey-7">({{ $t('groups.owner') }})</span>
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
