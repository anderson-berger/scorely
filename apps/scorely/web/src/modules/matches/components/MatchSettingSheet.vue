<script lang="ts">
import { MATCH_LIMITS, type Match, type MatchSeries, UpdateMatchInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { saveSeries } from '@scorely/web/src/modules/matches/match.series';
import { withSeriesSettings, withSettings } from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

/** Qual linha das configurações (PAR-18). O "Dia e hora" é o `MatchWhenSheet`. */
export type MatchSettingSection = 'format' | 'opening';

/** Campo de número vazio (ou limpo pelo X) = hora não configurada (PAR-03). */
type HoursField = number | '' | null;

const hoursOf = (value: number | undefined): HoursField => value ?? '';
const hoursFrom = (value: HoursField): number | undefined =>
  value === '' || value === null ? undefined : Number(value);

function formOf(match: Match) {
  return {
    limited: match.teams !== undefined,
    // Sem formato, os campos começam vazios: nenhum esporte é o padrão (PAR-02).
    teams: (match.teams ?? '') as number | '',
    playersPerTeam: (match.playersPerTeam ?? '') as number | '',
    membersHours: hoursOf(match.membersHours),
    reservesHours: hoursOf(match.reservesHours),
    guestsHours: hoursOf(match.guestsHours),
    acceptGuests: !match.noGuests,
    closeHours: match.closeHours,
  };
}

/**
 * PAR-02, 03, 06, 18: o painel de uma linha das configurações da partida. **Formato**: com limite (times × pessoas)
 * ou sem limite. **Abertura da lista**: a hora de cada um, em horas antes do início (vazio = desde já, ou junto com
 * o anterior), aceitar convidados e o fechamento. Manda o resto como está, com a `version`.
 * PAR-18, 22: na partida de uma repetição ativa, **Também nas próximas semanas** (ligado) muda também a repetição.
 */
export default defineComponent({
  name: 'MatchSettingSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    match: { type: Object as PropType<Match>, required: true },
    section: { type: String as PropType<MatchSettingSection>, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_match: Match) => true,
  },

  data() {
    return { form: formOf(this.match), saving: false, alsoNext: true, limits: MATCH_LIMITS };
  },

  computed: {
    /** A repetição ativa da partida mostrada (PAR-18). */
    activeSeries(): MatchSeries | undefined {
      const series = this.match.series;
      return series && !series.endedAt ? series : undefined;
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      this.form = formOf(this.match);
      this.alsoNext = true;
    },
  },

  methods: {
    patch() {
      const f = this.form;
      if (this.section === 'format') {
        return f.limited
          ? { teams: Number(f.teams), playersPerTeam: Number(f.playersPerTeam) }
          : { teams: undefined, playersPerTeam: undefined };
      }
      return {
        membersHours: hoursFrom(f.membersHours),
        reservesHours: hoursFrom(f.reservesHours),
        guestsHours: f.acceptGuests ? hoursFrom(f.guestsHours) : undefined,
        noGuests: !f.acceptGuests,
        closeHours: Number(f.closeHours || 0),
      };
    },

    async save() {
      const patch = this.patch();
      const parsed = UpdateMatchInputSchema.safeParse(withSettings(this.match, patch));
      if (!parsed.success) {
        this.$q.notify({ type: 'negative', message: issueMessage(parsed.error.issues[0]) });
        return;
      }
      this.saving = true;
      try {
        const saved = await matchesApi.update(this.groupId, this.match.id, parsed.data);
        const series = this.activeSeries;
        if (!series || !this.alsoNext) {
          this.$emit('saved', saved);
          return;
        }
        const result = await saveSeries(this.groupId, saved, withSeriesSettings(series, patch));
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
    :title="$t(`matches.settings.${section}`)"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-form class="fields" @submit.prevent="save">
      <div class="sc-caption">{{ $t(`matches.settings.${section}Hint`) }}</div>

      <template v-if="section === 'format'">
        <q-toggle v-model="form.limited" :label="$t('matches.settings.limited')" />
        <div v-if="form.limited" class="row2">
          <q-input
            v-model.number="form.teams"
            type="number"
            outlined
            dense
            :min="limits.teams.min"
            :max="limits.teams.max"
            :label="$t('matches.form.teams')"
          />
          <q-input
            v-model.number="form.playersPerTeam"
            type="number"
            outlined
            dense
            :min="limits.playersPerTeam.min"
            :max="limits.playersPerTeam.max"
            :label="$t('matches.form.playersPerTeam')"
          />
        </div>
      </template>

      <template v-else>
        <q-input
          v-model.number="form.membersHours"
          type="number"
          outlined
          dense
          clearable
          :min="0"
          :max="limits.waveMaxHours"
          :label="$t('matches.form.membersHours')"
          :hint="$t('matches.settings.membersEmpty')"
        />
        <q-input
          v-model.number="form.reservesHours"
          type="number"
          outlined
          dense
          clearable
          :min="0"
          :max="limits.waveMaxHours"
          :label="$t('matches.form.reservesHours')"
          :hint="$t('matches.settings.reservesEmpty')"
        />
        <q-toggle v-model="form.acceptGuests" :label="$t('matches.settings.acceptGuests')" />
        <q-input
          v-if="form.acceptGuests"
          v-model.number="form.guestsHours"
          type="number"
          outlined
          dense
          clearable
          :min="0"
          :max="limits.waveMaxHours"
          :label="$t('matches.form.guestsHours')"
          :hint="$t('matches.settings.guestsEmpty')"
        />
        <q-input
          v-model.number="form.closeHours"
          type="number"
          outlined
          dense
          :min="0"
          :max="limits.waveMaxHours"
          :label="$t('matches.form.closeHours')"
          :hint="$t('matches.settings.closeHint')"
        />
      </template>

      <q-toggle v-if="activeSeries" v-model="alsoNext" :label="$t('matches.series.alsoNext')" />

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
          :label="$t('matches.form.save')"
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

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
