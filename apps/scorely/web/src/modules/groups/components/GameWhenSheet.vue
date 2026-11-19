<script lang="ts">
import {
  CreateGameInputSchema,
  type Game,
  GROUP_LIMITS,
  type Place,
  RescheduleGameInputSchema,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime, localDateIn } from '@scorely/web/src/lib/datetime';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/** O número do campo, ou `undefined` vazio. */
const numberOf = (value: string) => (value.trim() ? Number(value) : undefined);

/**
 * Painel do jogo extra (GRP-68) e de remarcar (GRP-69): a data, o início, o fim e o lugar; o jogo extra também tem
 * as vagas e o mínimo. Quem muda é o `game` (remarcar) ou nada (jogo extra novo).
 */
export default defineComponent({
  name: 'GameWhenSheet',

  components: { BottomSheet },

  inject: permissionLostInject,

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    timeZone: { type: String, required: true },
    slots: { type: Number, required: true },
    minPlayers: { type: Number as PropType<number | undefined>, default: undefined },
    /** O jogo a remarcar; ausente = um jogo extra novo. */
    game: { type: Object as PropType<Game | undefined>, default: undefined },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: () => true,
  },

  data() {
    return {
      date: '',
      start: '19:00',
      end: '21:00',
      placeId: '',
      slotsField: '',
      minField: '',
      places: [] as Place[],
      saving: false,
      limits: GROUP_LIMITS,
    };
  },

  computed: {
    isExtra(): boolean {
      return this.game === undefined;
    },

    placeOptions(): { label: string; value: string }[] {
      return [
        {
          label: this.isExtra ? this.$t('groups.when.placeDefault') : this.$t('groups.when.placeKeep'),
          value: '',
        },
        ...this.places.filter((p) => !p.archivedAt).map((p) => ({ label: p.name, value: p.id })),
      ];
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      const game = this.game;
      if (game) {
        // No fuso do grupo, que é o das horas digitadas (GRP-68, 69).
        this.date = localDateIn(this.timeZone, new Date(game.startsAt));
        this.start = formatDateTime(game.startsAt, 'time', { timeZone: this.timeZone });
        this.end = formatDateTime(game.endsAt, 'time', { timeZone: this.timeZone });
      } else {
        this.date = '';
        this.start = '19:00';
        this.end = '21:00';
      }
      this.placeId = '';
      this.slotsField = '';
      this.minField = '';
      void this.loadPlaces();
    },
  },

  methods: {
    async loadPlaces() {
      try {
        this.places = await groupsApi.places(this.groupId);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    async save() {
      const slots = numberOf(this.slotsField);
      const minPlayers = numberOf(this.minField);
      const when = {
        date: this.date,
        start: this.start,
        end: this.end,
        ...(this.placeId && { placeId: this.placeId }),
      };
      const game = this.game;
      const parsed = game
        ? RescheduleGameInputSchema.safeParse({ ...when, version: game.version })
        : CreateGameInputSchema.safeParse({
            ...when,
            ...(slots !== undefined && { slots }),
            ...(minPlayers !== undefined && { minPlayers }),
          });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        this.$q.notify({ type: 'warning', message: issueMessage(issue, String(issue?.path[0] ?? '')) });
        return;
      }
      this.saving = true;
      try {
        if (game)
          await groupsApi.rescheduleGame(this.groupId, game.id, RescheduleGameInputSchema.parse(parsed.data));
        else await groupsApi.createExtraGame(this.groupId, CreateGameInputSchema.parse(parsed.data));
        this.$emit('update:modelValue', false);
        this.$q.notify({
          type: 'positive',
          message: this.$t(this.isExtra ? 'groups.when.extraSaved' : 'groups.when.rescheduled'),
        });
        this.$emit('saved');
      } catch (err) {
        // GRP-57: sem a permissão (ou com a versão velha), o painel fecha e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) this.$emit('update:modelValue', false);
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="isExtra ? $t('groups.when.extraTitle') : $t('groups.when.rescheduleTitle')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-caption q-mt-xs">
      {{ isExtra ? $t('groups.when.extraHint') : $t('groups.when.rescheduleHint') }}
    </div>
    <div class="form">
      <q-input v-model="date" type="date" outlined dense :label="$t('groups.when.date')" />
      <div class="pair">
        <q-input v-model="start" type="time" outlined dense :label="$t('groups.start')" />
        <q-input v-model="end" type="time" outlined dense :label="$t('groups.end')" />
      </div>
      <q-select
        v-model="placeId"
        outlined
        dense
        emit-value
        map-options
        :options="placeOptions"
        :label="$t('groups.schedules.place')"
      />
      <div v-if="isExtra" class="pair">
        <q-input
          v-model="slotsField"
          type="number"
          outlined
          dense
          :min="limits.slots.min"
          :max="limits.slots.max"
          :label="$t('groups.schedules.slots')"
          :hint="$t('groups.schedules.groupValue', { value: slots })"
        />
        <q-input
          v-model="minField"
          type="number"
          outlined
          dense
          :min="limits.minPlayers.min"
          :max="limits.minPlayers.max"
          :label="$t('groups.schedules.minPlayers')"
          :hint="$t('groups.schedules.groupValue', { value: minPlayers ?? $t('groups.schedules.noMin') })"
        />
      </div>
    </div>
    <div class="actions">
      <q-btn
        flat
        no-caps
        class="sc-btn-outline"
        :label="$t('groups.cancel')"
        :disable="saving"
        @click="$emit('update:modelValue', false)"
      />
      <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
    </div>
  </BottomSheet>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
