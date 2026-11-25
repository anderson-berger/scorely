<script lang="ts">
import type { CompetitionSummary, Match, MatchSeries } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { localDateIn } from '@scorely/web/src/lib/datetime';
import { competitionName, coversDay } from '@scorely/web/src/modules/groups/competitions/competition.display';
import { competitionsApi } from '@scorely/web/src/modules/groups/competitions/competitions.api';
import { saveSeries } from '@scorely/web/src/modules/groups/matches/match.series';
import { withSeriesSettings } from '@scorely/web/src/modules/groups/matches/match.settings';
import { defineComponent, type PropType } from 'vue';

/**
 * PAR-18, 40: o painel do **Vale para**: uma linha de ligar para cada competição aberta cujo período tem o dia da
 * partida (as que ela já tem aparecem sempre, para poder tirar); sem nenhuma, "Nenhuma competição aberta". Na partida
 * de uma repetição ativa, **Também nas próximas semanas** (ligado) muda também a repetição (PAR-22).
 */
export default defineComponent({
  name: 'MatchCompetitionsSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    match: { type: Object as PropType<Match>, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_match: Match) => true,
  },

  data() {
    return {
      options: [] as CompetitionSummary[],
      chosen: [] as string[],
      loading: false,
      saving: false,
      alsoNext: true,
    };
  },

  computed: {
    activeSeries(): MatchSeries | undefined {
      const series = this.match.series;
      return series && !series.endedAt ? series : undefined;
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      this.chosen = this.match.competitions.map((c) => c.id);
      this.alsoNext = true;
      this.load();
    },
  },

  methods: {
    name(c: CompetitionSummary): string {
      return competitionName(c);
    },

    async load() {
      this.loading = true;
      try {
        const current = new Set(this.match.competitions.map((c) => c.id));
        const start = new Date(this.match.startsAt);
        this.options = (await competitionsApi.list(this.groupId)).items.filter(
          (c) => current.has(c.id) || (c.status !== 'locked' && coversDay(c, localDateIn(c.timeZone, start))),
        );
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.loading = false;
      }
    },

    toggle(id: string, on: boolean) {
      this.chosen = on ? [...this.chosen, id] : this.chosen.filter((x) => x !== id);
    },

    async save() {
      this.saving = true;
      try {
        const saved = await competitionsApi.setMatchCompetitions(this.groupId, this.match.id, {
          competitionIds: this.chosen,
          expectedVersion: this.match.version,
        });
        const series = this.activeSeries;
        if (!series || !this.alsoNext) {
          this.$emit('saved', saved);
          return;
        }
        const result = await saveSeries(
          this.groupId,
          saved,
          withSeriesSettings(series, { competitionIds: this.chosen }),
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
    :title="$t('competitions.match.title')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-form class="fields" @submit.prevent="save">
      <div class="sc-caption">{{ $t('competitions.match.hint') }}</div>

      <q-spinner v-if="loading" color="primary" size="sm" />
      <div v-else-if="options.length === 0" class="sc-caption">{{ $t('competitions.match.noneOpen') }}</div>
      <q-toggle
        v-for="c in options"
        v-else
        :key="c.id"
        :model-value="chosen.includes(c.id)"
        :label="name(c)"
        @update:model-value="toggle(c.id, $event)"
      />

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
          :disable="loading"
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

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
