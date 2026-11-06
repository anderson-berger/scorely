<script lang="ts">
import { type Game, GROUP_LIMITS, type Group, UpdateGroupInputSchema } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { errorMessage, issueMessage } from '@/i18n/errors';
import { formatDateTime } from '@/lib/datetime';
import { groupsApi } from '../groups.api';

/** Quando a lista abre para cada camada; o dono configura (plano 007, D2/D11). */
export default defineComponent({
  name: 'LayersCard',

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game>, required: true },
    isOwner: { type: Boolean, default: false },
  },

  emits: ['saved'],

  data() {
    return {
      editing: false,
      saving: false,
      limits: GROUP_LIMITS,
      listOpensHoursBefore: 0 as number | string,
      reservesOpenHoursBefore: 0 as number | string,
      guestsEnabled: false,
      guestsOpenHoursBefore: 0 as number | string,
    };
  },

  methods: {
    when(iso: string): string {
      return formatDateTime(iso);
    },

    open() {
      this.listOpensHoursBefore = this.group.listOpensHoursBefore;
      this.reservesOpenHoursBefore = this.group.reservesOpenHoursBefore;
      this.guestsEnabled = this.group.guestsOpenHoursBefore !== undefined;
      this.guestsOpenHoursBefore =
        this.group.guestsOpenHoursBefore ?? Math.min(6, this.group.reservesOpenHoursBefore);
      this.editing = true;
    },

    async save() {
      const parsed = UpdateGroupInputSchema.safeParse({
        listOpensHoursBefore: Number(this.listOpensHoursBefore),
        reservesOpenHoursBefore: Number(this.reservesOpenHoursBefore),
        guestsOpenHoursBefore: this.guestsEnabled ? Number(this.guestsOpenHoursBefore) : null,
      });
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        await groupsApi.update(this.group.id, parsed.data);
        this.editing = false;
        this.$q.notify({ type: 'positive', message: this.$t('groups.layersSaved') });
        this.$emit('saved');
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="row items-center justify-between">
        <div class="text-subtitle1 text-weight-medium">{{ $t('groups.layers') }}</div>
        <q-btn v-if="isOwner" flat dense icon="tune" :label="$t('groups.editLayers')" @click="open" />
      </div>
      <div class="text-body2">{{ $t('groups.layerMembers', { date: when(game.opensAt) }) }}</div>
      <div class="text-body2">{{ $t('groups.layerReserves', { date: when(game.reservesOpensAt) }) }}</div>
      <div class="text-body2">
        {{ game.guestsOpensAt ? $t('groups.layerGuests', { date: when(game.guestsOpensAt) }) : $t('groups.guestsOff') }}
      </div>
    </q-card-section>

    <q-dialog v-model="editing">
      <q-card class="dialog">
        <q-card-section>
          <div class="text-h6">{{ $t('groups.layers') }}</div>
          <div class="text-caption text-grey-7">{{ $t('groups.layersHint') }}</div>
        </q-card-section>
        <q-card-section class="q-gutter-md">
          <q-input
            v-model="listOpensHoursBefore"
            type="number"
            :min="limits.listOpensHoursBefore.min"
            :max="limits.listOpensHoursBefore.max"
            :label="$t('groups.listOpensHoursBefore')"
            outlined
          />
          <q-input
            v-model="reservesOpenHoursBefore"
            type="number"
            :min="limits.reservesOpenHoursBefore.min"
            :max="limits.reservesOpenHoursBefore.max"
            :label="$t('groups.reservesOpenHoursBefore')"
            :hint="$t('groups.reservesOpenHoursBeforeHint')"
            outlined
          />
          <q-toggle v-model="guestsEnabled" :label="$t('groups.guestsEnabled')" />
          <q-input
            v-if="guestsEnabled"
            v-model="guestsOpenHoursBefore"
            type="number"
            :min="limits.guestsOpenHoursBefore.min"
            :max="limits.guestsOpenHoursBefore.max"
            :label="$t('groups.guestsOpenHoursBefore')"
            :hint="$t('groups.guestsOpenHoursBeforeHint')"
            outlined
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat :label="$t('groups.cancel')" @click="editing = false" />
          <q-btn color="primary" :label="$t('groups.save')" :loading="saving" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-card>
</template>

<style scoped>
.dialog {
  width: 420px;
  max-width: 90vw;
}
</style>
