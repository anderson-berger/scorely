<script lang="ts">
import { CreateMatchInputSchema, MATCH_DURATION, MATCH_LIMITS, type Match } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { zonedInputToIso, zonedInputValue } from '@scorely/web/src/lib/datetime';
import {
  durationOf,
  endFrom,
  joinDuration,
  splitDuration,
  withSettings,
} from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

/**
 * PAR-01, 17: criar a partida pede só o dia, a hora e a duração. Com `match`, é a linha "Dia e hora" das
 * configurações (PAR-06, 18), que muda só isso. A duração é livre, em horas e minutos (ex.: 1 h 45). O dia e a
 * hora são lidos no fuso de quem vê (ADR 0006).
 */
export default defineComponent({
  name: 'MatchWhenSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    /** Com a partida, o painel muda o dia e a hora dela; sem ela, cria. */
    match: { type: Object as PropType<Match>, default: undefined },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_match: Match) => true,
  },

  data() {
    return {
      date: '',
      time: '',
      ...splitDuration(MATCH_DURATION.defaultMinutes),
      saving: false,
      maxHours: MATCH_LIMITS.durationMaxHours,
    };
  },

  computed: {
    editing(): boolean {
      return this.match !== undefined;
    },

    total(): number | undefined {
      return joinDuration(Number(this.hours), Number(this.minutes));
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      const local = this.match ? zonedInputValue(this.match.startsAt) : '';
      this.date = local.slice(0, 10);
      this.time = local.slice(11, 16);
      Object.assign(this, splitDuration(this.match ? durationOf(this.match) : MATCH_DURATION.defaultMinutes));
    },
  },

  methods: {
    async save() {
      const total = this.total;
      if (total === undefined) {
        this.$q.notify({ type: 'negative', message: this.$t('matches.schedule.invalidDuration') });
        return;
      }
      const startsAt = zonedInputToIso(`${this.date}T${this.time}`) ?? '';
      const parsed = CreateMatchInputSchema.safeParse({
        startsAt,
        endsAt: startsAt && endFrom(startsAt, total),
      });
      if (!parsed.success) {
        this.$q.notify({ type: 'negative', message: issueMessage(parsed.error.issues[0]) });
        return;
      }
      this.saving = true;
      try {
        const saved = this.match
          ? await matchesApi.update(this.groupId, this.match.id, withSettings(this.match, parsed.data))
          : await matchesApi.create(this.groupId, parsed.data);
        this.$emit('saved', saved);
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
  <BottomSheet
    :model-value="modelValue"
    :title="editing ? $t('matches.schedule.editTitle') : $t('matches.schedule.createTitle')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-form class="fields" @submit.prevent="save">
      <div v-if="!editing" class="sc-caption">{{ $t('matches.schedule.hint') }}</div>

      <div class="row2">
        <q-input v-model="date" type="date" outlined dense stack-label :label="$t('matches.schedule.date')" />
        <q-input v-model="time" type="time" outlined dense stack-label :label="$t('matches.schedule.time')" />
      </div>

      <div>
        <div class="sc-label field-label">{{ $t('matches.schedule.duration') }}</div>
        <div class="row2">
          <q-input
            v-model.number="hours"
            type="number"
            outlined
            dense
            :min="0"
            :max="maxHours"
            :label="$t('matches.schedule.hours')"
          />
          <q-input
            v-model.number="minutes"
            type="number"
            outlined
            dense
            :min="0"
            :max="59"
            :label="$t('matches.schedule.minutes')"
          />
        </div>
      </div>

      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('matches.form.cancel')"
          :disable="saving"
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          type="submit"
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="editing ? $t('matches.form.save') : $t('matches.form.create')"
          :loading="saving"
        />
      </div>
    </q-form>
  </BottomSheet>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
}


.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

</style>
