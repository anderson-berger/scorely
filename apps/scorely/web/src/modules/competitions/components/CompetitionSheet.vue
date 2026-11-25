<script lang="ts">
import {
  COMPETITION_DEFAULT_POINTS,
  COMPETITION_LIMITS,
  type Competition,
  CreateCompetitionInputSchema,
  type MatchSeries,
  UpdateCompetitionInputSchema,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { currentTimeZone, localDateIn } from '@scorely/web/src/lib/datetime';
import { isVersionConflict } from '@scorely/web/src/lib/http';
import { endDateRange } from '@scorely/web/src/modules/competitions/competition.display';
import { competitionsApi } from '@scorely/web/src/modules/competitions/competitions.api';
import { everyLabel } from '@scorely/web/src/modules/matches/match.summary';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

type PointsForm = { win: number; draw: number; loss: number };

function formOf(competition: Competition | undefined) {
  return {
    name: competition?.name ?? '',
    endDate: competition?.endDate ?? '',
    points: { ...(competition?.points ?? COMPETITION_DEFAULT_POINTS) } as PointsForm,
  };
}

/**
 * COM-12: **Abrir temporada**: o nome (opcional), o fim, os pontos (3 / 1 / 0) e **Quais repetições entram**, uma
 * linha de ligar para cada repetição ativa, todas ligadas.
 * COM-13: **Editar**: o nome, o fim e, enquanto nenhum resultado soma, os pontos (COM-04).
 */
export default defineComponent({
  name: 'CompetitionSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    /** Editar esta; sem ela, abrir uma nova. */
    competition: { type: Object as PropType<Competition>, default: undefined },
    /** O N do "Temporada N" de exemplo (COM-02). */
    nextNumber: { type: Number, default: 1 },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_competition: Competition) => true,
    conflict: () => true,
  },

  data() {
    return {
      form: formOf(this.competition),
      series: [] as MatchSeries[],
      chosen: [] as string[],
      loadingSeries: false,
      saving: false,
      limits: COMPETITION_LIMITS,
    };
  },

  computed: {
    editing(): boolean {
      return this.competition !== undefined;
    },

    pointsLocked(): boolean {
      return this.competition !== undefined && !this.competition.actions.editPoints;
    },

    /** COM-02, 04: o fim que o seletor aceita (abrir começa hoje, no fuso de quem abre). */
    endRange(): { min: string; max: string } {
      const c = this.competition;
      const today = localDateIn(c?.timeZone ?? currentTimeZone());
      return endDateRange(c?.startDate ?? today, today);
    },

    /** COM-11: no prazo, só o nome muda. */
    inGrace(): boolean {
      return this.competition?.status === 'grace';
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (!open) return;
      this.form = formOf(this.competition);
      if (!this.editing) this.loadSeries();
    },
  },

  methods: {
    seriesLabel(s: MatchSeries): string {
      return `${everyLabel(s.weekday)} · ${s.time}`;
    },

    /** As repetições ativas, pelas partidas por vir de cada uma (todas começam ligadas, COM-12). */
    async loadSeries() {
      this.loadingSeries = true;
      try {
        const upcoming = (await matchesApi.list(this.groupId)).filter((m) => m.seriesWeekday !== undefined);
        const matches = await Promise.all(upcoming.map((m) => matchesApi.get(this.groupId, m.id)));
        const byId = new Map(
          matches.flatMap((m) => (m.series && !m.series.endedAt ? [[m.series.id, m.series] as const] : [])),
        );
        this.series = [...byId.values()].sort(
          (a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time),
        );
        this.chosen = this.series.map((s) => s.id);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.loadingSeries = false;
      }
    },

    toggle(id: string, on: boolean) {
      this.chosen = on ? [...this.chosen, id] : this.chosen.filter((x) => x !== id);
    },

    fields() {
      const name = this.form.name.trim();
      return {
        ...(name && { name }),
        endDate: this.form.endDate,
        points: {
          win: Number(this.form.points.win),
          draw: Number(this.form.points.draw),
          loss: Number(this.form.points.loss),
        },
      };
    },

    /** A chamada certa, ou `undefined` com o aviso do primeiro problema do form. */
    request(): (() => Promise<Competition>) | undefined {
      const c = this.competition;
      const parsed = c
        ? UpdateCompetitionInputSchema.safeParse({ ...this.fields(), expectedVersion: c.version })
        : CreateCompetitionInputSchema.safeParse({
            type: 'season',
            ...this.fields(),
            timeZone: currentTimeZone(),
            seriesIds: this.chosen,
          });
      if (!parsed.success) {
        this.$q.notify({ type: 'negative', message: issueMessage(parsed.error.issues[0]) });
        return undefined;
      }
      const data = parsed.data;
      if (c && !('seriesIds' in data)) return () => competitionsApi.update(this.groupId, c.id, data);
      if ('seriesIds' in data) return () => competitionsApi.create(this.groupId, data);
      return undefined;
    },

    async save() {
      const send = this.request();
      if (!send) return;
      this.saving = true;
      try {
        const saved = await send();
        this.$emit('saved', saved);
      } catch (err) {
        if (isVersionConflict(err)) {
          this.$q.notify({ type: 'warning', message: this.$t('competitions.conflict') });
          this.$emit('conflict');
          return;
        }
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
    :title="$t(editing ? 'competitions.form.editTitle' : 'competitions.form.createTitle')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-form class="fields" @submit.prevent="save">
      <div class="sc-caption">{{ $t('competitions.form.hint') }}</div>

      <q-input
        v-model="form.name"
        outlined
        dense
        :maxlength="limits.name"
        :label="$t('competitions.form.name')"
        :placeholder="$t('competitions.defaultName', { n: competition?.number ?? nextNumber })"
      />
      <q-input
        v-model="form.endDate"
        type="date"
        outlined
        dense
        stack-label
        :disable="inGrace"
        :min="endRange.min"
        :max="endRange.max"
        :hint="inGrace ? undefined : $t('competitions.form.endHint')"
        :label="$t('competitions.form.end')"
      />

      <div>
        <div class="sc-section">{{ $t('competitions.form.points') }}</div>
        <div class="row3">
          <q-input
            v-for="k in (['win', 'draw', 'loss'] as const)"
            :key="k"
            v-model.number="form.points[k]"
            type="number"
            outlined
            dense
            :min="limits.points.min"
            :max="limits.points.max"
            :disable="pointsLocked"
            :label="$t(`competitions.form.${k}`)"
          />
        </div>
        <div v-if="pointsLocked" class="sc-caption">{{ $t('competitions.form.pointsLocked') }}</div>
      </div>

      <div v-if="!editing">
        <div class="sc-section">{{ $t('competitions.form.series') }}</div>
        <q-spinner v-if="loadingSeries" color="primary" size="sm" />
        <div v-else-if="series.length === 0" class="sc-caption">{{ $t('competitions.form.noSeries') }}</div>
        <q-toggle
          v-for="s in series"
          v-else
          :key="s.id"
          :model-value="chosen.includes(s.id)"
          :label="seriesLabel(s)"
          @update:model-value="toggle(s.id, $event)"
        />
      </div>

      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('competitions.form.cancel')"
          :disable="saving"
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          type="submit"
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="$t(editing ? 'competitions.form.save' : 'competitions.form.create')"
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

.row3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
