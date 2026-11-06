<script lang="ts">
import type { Attendee, Game } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { formatDateTime } from '@/lib/datetime';
import { type ListGate, listGate } from '../links';

/** O jogo atual: status, lista com o papel de cada um e os botões de quem vê (plano 007, D8). */
export default defineComponent({
  name: 'GameCard',

  props: {
    game: { type: Object as PropType<Game>, required: true },
    busy: { type: Boolean, default: false },
    canCancel: { type: Boolean, default: false },
  },

  emits: ['confirm', 'leave', 'cancel'],

  computed: {
    gate(): ListGate {
      return listGate(this.game, new Date());
    },
  },

  methods: {
    when(iso: string): string {
      return formatDateTime(iso);
    },

    personName(p: Pick<Attendee, 'name'>): string {
      return p.name ?? this.$t('groups.unnamed');
    },
  },
});
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="row items-center justify-between">
        <div class="text-subtitle1 text-weight-medium">{{ $t('groups.game', { date: when(game.startsAt) }) }}</div>
        <q-chip dense :color="game.status === 'cancelled' ? 'red-2' : 'blue-1'">
          {{ $t(`gameStatus.${game.status}`) }}
        </q-chip>
      </div>
      <div v-if="gate.kind === 'opens_at'" class="text-body2 text-grey-7">
        {{ $t('groups.youCanConfirmAt', { date: when(gate.at) }) }}
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
        v-if="gate.kind === 'can_change' && !game.me"
        color="primary"
        :label="$t('groups.confirm')"
        :loading="busy"
        @click="$emit('confirm')"
      />
      <q-btn
        v-if="gate.kind === 'can_change' && game.me"
        flat
        :label="$t('groups.leave')"
        :loading="busy"
        @click="$emit('leave')"
      />
      <q-space />
      <q-btn
        v-if="canCancel"
        flat
        color="negative"
        :label="$t('groups.cancelGame')"
        :disable="busy"
        @click="$emit('cancel')"
      />
    </q-card-actions>

    <q-separator />
    <q-list dense>
      <q-item-label header>{{ $t('groups.confirmed') }}</q-item-label>
      <q-item v-for="(a, i) in game.confirmed" :key="a.userId">
        <q-item-section avatar>{{ i + 1 }}</q-item-section>
        <q-item-section>
          <q-item-label>
            {{ personName(a) }}
            <span v-if="a.role !== 'member'" class="text-caption text-grey-7">({{ $t(`groups.roles.${a.role}`) }})</span>
          </q-item-label>
        </q-item-section>
      </q-item>
      <q-item v-if="game.confirmed.length === 0">
        <q-item-section class="text-grey-7">{{ $t('groups.emptyList') }}</q-item-section>
      </q-item>
      <template v-if="game.waitlist.length > 0">
        <q-item-label header>{{ $t('groups.waitlist') }}</q-item-label>
        <q-item v-for="(a, i) in game.waitlist" :key="a.userId">
          <q-item-section avatar>{{ i + 1 }}</q-item-section>
          <q-item-section>
            <q-item-label>
              {{ personName(a) }}
              <span v-if="a.role !== 'member'" class="text-caption text-grey-7">({{ $t(`groups.roles.${a.role}`) }})</span>
            </q-item-label>
          </q-item-section>
        </q-item>
      </template>
    </q-list>
  </q-card>
</template>
