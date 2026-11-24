<script lang="ts">
import {
  CreateMatchInputSchema,
  MATCH_DURATION,
  MATCH_LIMITS,
  type Match,
  type MatchSeries,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { currentTimeZone, zonedInputToIso, zonedInputValue } from '@scorely/web/src/lib/datetime';
import { saveSeries } from '@scorely/web/src/modules/matches/match.series';
import {
  durationOf,
  endFrom,
  joinDuration,
  seriesWhenOf,
  splitDuration,
  weekdayOfDate,
  withSeriesSettings,
  withSettings,
} from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

/**
 * PAR-01, 17: criar a partida pede só o dia, a hora e a duração. Com `match`, é a linha "Dia e hora" das
 * configurações (PAR-06, 18), que muda só isso. A duração é livre, em horas e minutos (ex.: 1 h 45). O dia e a
 * hora são lidos no fuso de quem vê (ADR 0006).
 * PAR-17, 20: no criar, **Repetir toda semana** (desligado) manda o fuso de quem cria e mostra "Toda sexta às 19:00".
 * PAR-18, 22: na partida de uma repetição ativa, **Também nas próximas semanas** (desligado) muda também a repetição.
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
      repeatWeekly: false,
      alsoNext: false,
      maxHours: MATCH_LIMITS.durationMaxHours,
    };
  },

  computed: {
    editing(): boolean {
      return this.match !== undefined;
    },

    /** A repetição ativa da partida mostrada (PAR-18). */
    activeSeries(): MatchSeries | undefined {
      const series = this.match?.series;
      return series && !series.endedAt ? series : undefined;
    },

    /** "Toda sexta às 19:00", pelo dia e pela hora escolhidos (PAR-17). */
    repeatPreview(): string {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date) || !/^\d{2}:\d{2}$/.test(this.time)) return '';
      return this.$t('matches.series.preview', {
        every: this.$t(`matches.series.every.${weekdayOfDate(this.date)}`),
        time: this.time,
      });
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
      this.repeatWeekly = false;
      this.alsoNext = false;
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
        ...(!this.match && this.repeatWeekly && { repeatWeekly: true, timeZone: currentTimeZone() }),
      });
      if (!parsed.success) {
        this.$q.notify({ type: 'negative', message: issueMessage(parsed.error.issues[0]) });
        return;
      }
      this.saving = true;
      try {
        if (!this.match) {
          this.$emit('saved', await matchesApi.create(this.groupId, parsed.data));
          return;
        }
        const { startsAt: start, endsAt: end } = parsed.data;
        const saved = await matchesApi.update(
          this.groupId,
          this.match.id,
          withSettings(this.match, { startsAt: start, endsAt: end }),
        );
        const series = this.activeSeries;
        if (!series || !this.alsoNext) {
          this.$emit('saved', saved);
          return;
        }
        const result = await saveSeries(
          this.groupId,
          saved,
          withSeriesSettings(series, seriesWhenOf(start, total, series.timeZone)),
        );
        if (result.error) this.$q.notify({ type: 'negative', message: errorMessage(result.error) });
        this.$emit('saved', result.match);
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

      <template v-if="!editing">
        <q-toggle v-model="repeatWeekly" :label="$t('matches.series.repeat')" />
        <div v-if="repeatWeekly && repeatPreview" class="sc-caption">{{ repeatPreview }}</div>
      </template>
      <q-toggle v-else-if="activeSeries" v-model="alsoNext" :label="$t('matches.series.alsoNext')" />

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
