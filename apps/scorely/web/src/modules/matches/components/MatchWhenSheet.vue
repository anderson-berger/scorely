<script lang="ts">
import { CreateMatchInputSchema, MATCH_DURATION, MATCH_LIMITS, type Match } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { zonedInputToIso, zonedInputValue } from '@scorely/web/src/lib/datetime';
import {
  durationLabel,
  durationOf,
  endFrom,
  withSettings,
} from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

const OTHER = 'other' as const;
const MAX_MINUTES = MATCH_LIMITS.durationMaxHours * 60;

/**
 * PAR-01, 17: criar a partida pede só o dia, a hora e a duração. Com `match`, é a linha "Dia e hora" das
 * configurações (PAR-06, 18), que muda só isso. O dia e a hora são lidos no fuso de quem vê (ADR 0006).
 */
export default defineComponent({
  name: 'MatchWhenSheet',

  components: { BottomSheet, HoursStepper },

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
      minutes: MATCH_DURATION.defaultMinutes as number,
      choice: MATCH_DURATION.defaultMinutes as number | typeof OTHER,
      saving: false,
    };
  },

  computed: {
    editing(): boolean {
      return this.match !== undefined;
    },

    options(): { label: string; value: number | typeof OTHER }[] {
      return [
        ...MATCH_DURATION.optionsMinutes.map((m) => ({ label: durationLabel(m), value: m })),
        { label: this.$t('matches.schedule.other'), value: OTHER },
      ];
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      const local = this.match ? zonedInputValue(this.match.startsAt) : '';
      this.date = local.slice(0, 10);
      this.time = local.slice(11, 16);
      this.minutes = this.match ? durationOf(this.match) : MATCH_DURATION.defaultMinutes;
      this.choice = (MATCH_DURATION.optionsMinutes as readonly number[]).includes(this.minutes)
        ? this.minutes
        : OTHER;
    },

    choice(value: number | typeof OTHER) {
      if (value !== OTHER) this.minutes = value;
    },
  },

  methods: {
    durationLabel(minutes: number): string {
      return durationLabel(minutes);
    },

    step(direction: number) {
      const next = this.minutes + direction * MATCH_DURATION.stepMinutes;
      this.minutes = Math.min(MAX_MINUTES, Math.max(MATCH_DURATION.stepMinutes, next));
    },

    async save() {
      const startsAt = zonedInputToIso(`${this.date}T${this.time}`) ?? '';
      const parsed = CreateMatchInputSchema.safeParse({
        startsAt,
        endsAt: startsAt && endFrom(startsAt, this.minutes),
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
        <q-btn-toggle v-model="choice" no-caps unelevated toggle-color="primary" :options="options" />
        <div v-if="choice === 'other'" class="other">
          <HoursStepper
            :value="minutes / 60"
            unit="h"
            :dec-label="$t('matches.schedule.less')"
            :inc-label="$t('matches.schedule.more')"
            @step="step"
          />
          <span class="sc-caption">{{ durationLabel(minutes) }}</span>
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

.other {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.fields :deep(.q-btn-group) {
  flex-wrap: wrap;
}
</style>
