<script lang="ts">
import type { Group, InviteKind } from '@scorely/contracts';
import { copyToClipboard } from 'quasar';
import { defineComponent, type PropType } from 'vue';
import { inviteUrl } from '../links';

interface LinkRow {
  kind: InviteKind;
  label: string;
  hint: string;
  url: string;
}

/** Os links do dono (plano 007, D5/D7): membro, reserva e, com convidados ligados, o do jogo. */
export default defineComponent({
  name: 'GroupLinksCard',

  props: {
    group: { type: Object as PropType<Group>, required: true },
    busy: { type: Boolean, default: false },
  },

  emits: ['rotate'],

  computed: {
    rows(): LinkRow[] {
      const origin = window.location.origin;
      const url = (kind: InviteKind, token: string | undefined) =>
        token ? inviteUrl(origin, kind, token) : '';
      const rows: LinkRow[] = [
        {
          kind: 'member',
          label: this.$t('groups.linkMember'),
          hint: this.$t('groups.linkMemberHint'),
          url: url('member', this.group.inviteToken),
        },
        {
          kind: 'reserve',
          label: this.$t('groups.linkReserve'),
          hint: this.$t('groups.linkReserveHint'),
          url: url('reserve', this.group.reserveInviteToken),
        },
      ];
      if (this.group.guestsOpenHoursBefore === undefined) return rows;
      return [
        ...rows,
        {
          kind: 'guest',
          label: this.$t('groups.linkGuest'),
          hint: this.$t('groups.linkGuestHint'),
          url: url('guest', this.group.guestToken),
        },
      ];
    },
  },

  methods: {
    async copy(url: string) {
      await copyToClipboard(url);
      this.$q.notify({ type: 'positive', message: this.$t('groups.copied') });
    },
  },
});
</script>

<template>
  <q-card flat bordered>
    <q-card-section class="q-pb-none">
      <div class="text-subtitle1 text-weight-medium">{{ $t('groups.links') }}</div>
    </q-card-section>
    <q-card-section v-for="row in rows" :key="row.kind">
      <div class="text-body2 text-weight-medium">{{ row.label }}</div>
      <div class="text-caption text-grey-7 q-mb-sm">{{ row.hint }}</div>
      <template v-if="row.url">
        <q-input :model-value="row.url" readonly dense outlined />
        <div class="row q-mt-xs">
          <q-btn flat dense icon="content_copy" :label="$t('groups.copy')" @click="copy(row.url)" />
          <q-btn
            flat
            dense
            icon="autorenew"
            :label="$t('groups.rotate')"
            :disable="busy"
            @click="$emit('rotate', row.kind)"
          />
        </div>
      </template>
      <template v-else>
        <div class="text-caption text-grey-7">{{ $t('groups.linkMissing') }}</div>
        <q-btn flat dense icon="add_link" :label="$t('groups.generate')" :disable="busy" @click="$emit('rotate', row.kind)" />
      </template>
    </q-card-section>
  </q-card>
</template>
