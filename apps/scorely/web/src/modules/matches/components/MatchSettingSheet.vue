<script lang="ts">
import { MATCH_LIMITS, type Match, UpdateMatchInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { withSettings } from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

/** Qual linha das configurações (PAR-18). O "Dia e hora" é o `MatchWhenSheet`. */
export type MatchSettingSection = 'format' | 'waves' | 'note';

/** Quando os convidados são ligados de novo, a onda deles começa no fechamento, a última possível (PAR-03). */
function formOf(match: Match) {
  return {
    teams: match.teams,
    playersPerTeam: match.playersPerTeam,
    membersHours: match.membersHours,
    reservesHours: match.reservesHours,
    guestsOn: match.guestsHours !== undefined,
    guestsHours: match.guestsHours ?? match.closeHours,
    closeHours: match.closeHours,
    note: match.note ?? '',
  };
}

/** PAR-06, 18: o painel de uma linha das configurações da partida. Manda o resto como está, com a `version`. */
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
    return { form: formOf(this.match), saving: false, limits: MATCH_LIMITS };
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.form = formOf(this.match);
    },
  },

  methods: {
    patch() {
      const f = this.form;
      if (this.section === 'format') {
        return { teams: Number(f.teams), playersPerTeam: Number(f.playersPerTeam) };
      }
      if (this.section === 'waves') {
        return {
          membersHours: Number(f.membersHours),
          reservesHours: Number(f.reservesHours),
          guestsHours: f.guestsOn ? Number(f.guestsHours) : undefined,
          closeHours: Number(f.closeHours),
        };
      }
      return { note: f.note.trim() === '' ? undefined : f.note };
    },

    async save() {
      const parsed = UpdateMatchInputSchema.safeParse(withSettings(this.match, this.patch()));
      if (!parsed.success) {
        this.$q.notify({ type: 'negative', message: issueMessage(parsed.error.issues[0]) });
        return;
      }
      this.saving = true;
      try {
        this.$emit('saved', await matchesApi.update(this.groupId, this.match.id, parsed.data));
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

      <div v-if="section === 'format'" class="row2">
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

      <template v-else-if="section === 'waves'">
        <div class="row2">
          <q-input
            v-model.number="form.membersHours"
            type="number"
            outlined
            dense
            :min="0"
            :max="limits.waveMaxHours"
            :label="$t('matches.form.membersHours')"
          />
          <q-input
            v-model.number="form.reservesHours"
            type="number"
            outlined
            dense
            :min="0"
            :max="limits.waveMaxHours"
            :label="$t('matches.form.reservesHours')"
          />
        </div>
        <q-toggle v-model="form.guestsOn" :label="$t('matches.form.guestsOn')" />
        <div class="row2">
          <q-input
            v-if="form.guestsOn"
            v-model.number="form.guestsHours"
            type="number"
            outlined
            dense
            :min="0"
            :max="limits.waveMaxHours"
            :label="$t('matches.form.guestsHours')"
          />
          <q-input
            v-model.number="form.closeHours"
            type="number"
            outlined
            dense
            :min="0"
            :max="limits.waveMaxHours"
            :label="$t('matches.form.closeHours')"
          />
        </div>
      </template>

      <q-input
        v-else
        v-model="form.note"
        outlined
        dense
        autofocus
        :maxlength="limits.note"
        :label="$t('matches.form.note')"
      />

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
