<template>
  <div class="match-players-list">
    <div class="row items-center justify-between q-mb-md">
      <span class="text-subtitle2 text-white">Jogadores</span>
      <q-badge color="grey-7" :label="`${members.length} / ${maxPlayers}`" />
    </div>

    <q-list separator>
      <q-item v-for="member in members" :key="member.id" dense>
        <q-item-section avatar>
          <q-avatar size="32px" color="grey-8" text-color="white">
            {{ member.userId.slice(0, 2).toUpperCase() }}
          </q-avatar>
        </q-item-section>

        <q-item-section>
          <q-item-label class="text-grey-3">{{ member.userId }}</q-item-label>
          <q-item-label caption>
            <q-badge
              :color="roleColor(member.role)"
              :label="roleLabel(member.role)"
              class="q-mr-xs"
            />
            <q-badge :color="statusColor(member.status)" :label="statusLabel(member.status)" />
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <div v-if="members.length === 0" class="text-center q-py-lg text-grey-6">
      <q-icon name="group" size="32px" />
      <p class="q-mt-sm text-caption">Nenhum membro ainda</p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { MatchUser } from '@scorely/api/modules/match/member/user/match_user_types';

const ROLE_LABEL: Record<MatchUser['role'], string> = {
  OWNER: 'Dono',
  ADMIN: 'Admin',
  MEMBER: 'Membro',
};

const ROLE_COLOR: Record<MatchUser['role'], string> = {
  OWNER: 'deep-purple',
  ADMIN: 'indigo',
  MEMBER: 'grey-7',
};

const STATUS_LABEL: Record<MatchUser['status'], string> = {
  INVITED: 'Convidado',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Recusou',
  LEFT: 'Saiu',
};

const STATUS_COLOR: Record<MatchUser['status'], string> = {
  INVITED: 'blue-grey',
  CONFIRMED: 'positive',
  DECLINED: 'negative',
  LEFT: 'grey-6',
};

export default defineComponent({
  name: 'MatchPlayersList',

  props: {
    members: {
      type: Array as PropType<MatchUser[]>,
      required: true,
    },
    maxPlayers: {
      type: Number,
      required: true,
    },
  },

  methods: {
    roleLabel(role: MatchUser['role']): string {
      return ROLE_LABEL[role];
    },
    roleColor(role: MatchUser['role']): string {
      return ROLE_COLOR[role];
    },
    statusLabel(status: MatchUser['status']): string {
      return STATUS_LABEL[status];
    },
    statusColor(status: MatchUser['status']): string {
      return STATUS_COLOR[status];
    },
  },
});
</script>
