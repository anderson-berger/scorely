<script lang="ts">
import type { Match, MatchSeries } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { formatSummary, openingSummary, seriesSummary } from '@scorely/web/src/modules/matches/match.summary';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

/**
 * PAR-18, 20, 23: a linha Repetição das configurações. Mostra o que a repetição tem (dia, hora, duração, fuso,
 * formato e abertura) e, ativa, **Encerrar repetição** com a confirmação do que fica: a partida mostrada continua.
 */
export default defineComponent({
  name: 'MatchSeriesSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    match: { type: Object as PropType<Match>, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    ended: (_series: MatchSeries) => true,
  },

  data() {
    return { ending: false };
  },

  computed: {
    series(): MatchSeries | undefined {
      return this.match.series;
    },

    lines(): { icon: string; text: string }[] {
      const s = this.series;
      if (!s) return [];
      return [
        { icon: 'event_repeat', text: seriesSummary(s) },
        { icon: 'public', text: this.$t('matches.series.timeZone', { timeZone: s.timeZone }) },
        { icon: 'groups', text: formatSummary(s) },
        { icon: 'schedule', text: openingSummary(s) },
      ];
    },
  },

  methods: {
    confirmEnd() {
      const s = this.series;
      if (!s) return;
      const at = this.match.startsAt;
      const day = `${formatDateTime(at, 'weekdayShort').replace(/\.$/, '')}, ${formatDateTime(at, 'dayMonth')}`;
      this.$q
        .dialog({
          title: this.$t('matches.series.endTitle'),
          message: this.$t('matches.series.endConfirm', { day }),
          cancel: { label: this.$t('matches.keep'), flat: true },
          ok: { label: this.$t('matches.series.end'), color: 'negative', flat: true },
        })
        .onOk(() => this.end(s.id));
    },

    async end(seriesId: string) {
      this.ending = true;
      try {
        const series = await matchesApi.endSeries(this.groupId, seriesId);
        this.$q.notify({ type: 'positive', message: this.$t('matches.series.endDone') });
        this.$emit('ended', series);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.ending = false;
      }
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="$t('matches.series.title')"
    :persistent="ending"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="fields">
      <div class="sc-caption">{{ series?.endedAt ? $t('matches.series.endedHint') : $t('matches.series.hint') }}</div>

      <ul class="lines">
        <li v-for="l in lines" :key="l.icon" class="line">
          <q-icon :name="l.icon" size="20px" />
          <span>{{ l.text }}</span>
        </li>
      </ul>

      <div class="actions">
        <q-btn
          v-if="series && !series.endedAt"
          flat
          no-caps
          color="negative"
          icon="event_busy"
          :label="$t('matches.series.end')"
          :loading="ending"
          @click="confirmEnd"
        />
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('matches.series.close')"
          :disable="ending"
          @click="$emit('update:modelValue', false)"
        />
      </div>
    </div>
  </BottomSheet>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.lines {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
