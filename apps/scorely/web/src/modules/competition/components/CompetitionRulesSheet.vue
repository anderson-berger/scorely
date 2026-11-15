<script lang="ts">
import {
  type Competition,
  type CompetitionPoints,
  type CompetitionPresetId,
  CompetitionPresetIdSchema,
  type CompetitionRules,
  CompetitionRulesSchema,
  type CompetitionUnit,
  CompetitionUnitSchema,
  type Tiebreak,
  TiebreakSchema,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import {
  copyRules,
  moveTiebreak,
  POINT_KEYS,
  presetRules,
  signed,
  stepPoint,
  toggleTiebreak,
} from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * Painel do regulamento (CMP-06–08, 10): os 3 modelos no topo (tocar preenche), os 6 pontos, a unidade e a ordem do
 * desempate. Salvar manda o regulamento inteiro (CMP-07). Usado nos Ajustes e na aba Competição.
 */
export default defineComponent({
  name: 'CompetitionRulesSheet',

  components: { BottomSheet, HoursStepper },

  inject: permissionLostInject,

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    competition: { type: Object as PropType<Competition>, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_c: Competition) => true,
    /** A competição mudou por fora (venceu): quem usa relê. */
    reload: () => true,
  },

  data() {
    return {
      draft: undefined as CompetitionRules | undefined,
      saving: false,
    };
  },

  computed: {
    presets(): CompetitionPresetId[] {
      return CompetitionPresetIdSchema.options;
    },

    pointKeys(): (keyof CompetitionPoints)[] {
      return POINT_KEYS;
    },

    units(): CompetitionUnit[] {
      return CompetitionUnitSchema.options;
    },

    /** Os critérios fora do desempate, para incluir no fim. */
    available(): Tiebreak[] {
      const used = this.draft?.tiebreak ?? [];
      return TiebreakSchema.options.filter((c) => !used.includes(c));
    },
  },

  watch: {
    modelValue: { immediate: true, handler: 'reset' },
  },

  methods: {
    signed,

    reset(open: boolean) {
      if (open && this.competition.rules) this.draft = copyRules(this.competition.rules);
    },

    close() {
      this.$emit('update:modelValue', false);
    },

    usePreset(id: CompetitionPresetId) {
      this.draft = presetRules(id);
    },

    step(key: keyof CompetitionPoints, dir: 1 | -1) {
      if (!this.draft) return;
      this.draft = {
        ...this.draft,
        points: { ...this.draft.points, [key]: stepPoint(this.draft.points[key], dir) },
      };
    },

    setUnit(unit: CompetitionUnit) {
      if (this.draft) this.draft = { ...this.draft, unit };
    },

    toggle(c: Tiebreak) {
      if (this.draft) this.draft = { ...this.draft, tiebreak: toggleTiebreak(this.draft.tiebreak, c) };
    },

    move(index: number, dir: 1 | -1) {
      if (this.draft) this.draft = { ...this.draft, tiebreak: moveTiebreak(this.draft.tiebreak, index, dir) };
    },

    tiebreakName(c: Tiebreak): string {
      return this.$t(`competition.tiebreak.${c}`);
    },

    async save() {
      const parsed = CompetitionRulesSchema.safeParse(this.draft);
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        const saved = await competitionApi.updateRules(this.groupId, {
          ...parsed.data,
          // CMP-42: a versão da competição que a tela mostra.
          version: this.competition.version ?? 0,
        });
        this.$q.notify({ type: 'positive', message: this.$t('competition.rules.saved') });
        this.$emit('saved', saved);
        this.close();
      } catch (err) {
        // GRP-57: sem a permissão, o painel fecha e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) return this.close();
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        // CMP-10: venceu com o painel aberto → fecha e relê a competição.
        if (err instanceof ApiRequestError && err.code === 'COMPETITION_INACTIVE') {
          this.close();
          this.$emit('reload');
        }
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
    :title="$t('competition.rules.title')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="draft">
      <div class="sc-caption q-mt-xs">{{ $t('competition.rules.hint') }}</div>

      <h3 class="sc-section sub">{{ $t('competition.presets.title') }}</h3>
      <div class="chips">
        <q-btn
          v-for="p in presets"
          :key="p"
          flat
          no-caps
          class="sc-btn-outline chip"
          :label="$t(`competition.presets.${p}`)"
          :disable="saving"
          @click="usePreset(p)"
        />
      </div>

      <h3 class="sc-section sub">{{ $t('competition.pointsTitle') }}</h3>
      <div v-for="k in pointKeys" :key="k" class="row">
        <div>
          <div class="sc-display row-name">{{ $t(`competition.points.${k}`) }}</div>
          <div class="sc-caption">{{ $t(`competition.pointsHint.${k}`) }}</div>
        </div>
        <HoursStepper
          :value="draft.points[k]"
          :dec-label="$t('competition.rules.less', { name: $t(`competition.points.${k}`) })"
          :inc-label="$t('competition.rules.more', { name: $t(`competition.points.${k}`) })"
          :disable="saving"
          @step="step(k, $event)"
        />
      </div>

      <h3 class="sc-section sub">{{ $t('competition.unit.title') }}</h3>
      <div class="units" role="radiogroup">
        <button
          v-for="u in units"
          :key="u"
          type="button"
          role="radio"
          class="unit"
          :class="{ 'unit--on': draft.unit === u }"
          :aria-checked="draft.unit === u"
          :disabled="saving"
          @click="setUnit(u)"
        >
          <span class="sc-display unit-name">{{ $t(`competition.unit.${u}`) }}</span>
          <span class="sc-caption">{{ $t(`competition.unit.${u}Hint`) }}</span>
        </button>
      </div>

      <h3 class="sc-section sub">{{ $t('competition.tiebreak.title') }}</h3>
      <div class="sc-caption">{{ $t('competition.tiebreak.hint') }}</div>
      <div v-if="draft.tiebreak.length === 0" class="sc-caption empty">{{ $t('competition.tiebreak.empty') }}</div>
      <div v-for="(c, i) in draft.tiebreak" :key="c" class="row">
        <div>
          <div class="sc-display row-name">{{ i + 1 }}. {{ tiebreakName(c) }}</div>
          <div class="sc-caption">{{ $t(`competition.tiebreak.${c}Hint`) }}</div>
        </div>
        <div class="tb-actions">
          <q-btn
            flat
            round
            dense
            icon="arrow_upward"
            :aria-label="$t('competition.tiebreak.up', { name: tiebreakName(c) })"
            :disable="saving || i === 0"
            @click="move(i, -1)"
          />
          <q-btn
            flat
            round
            dense
            icon="arrow_downward"
            :aria-label="$t('competition.tiebreak.down', { name: tiebreakName(c) })"
            :disable="saving || i === draft.tiebreak.length - 1"
            @click="move(i, 1)"
          />
          <q-btn
            flat
            round
            dense
            icon="close"
            :aria-label="$t('competition.tiebreak.remove', { name: tiebreakName(c) })"
            :disable="saving"
            @click="toggle(c)"
          />
        </div>
      </div>
      <div v-if="available.length > 0" class="chips">
        <q-btn
          v-for="c in available"
          :key="c"
          flat
          no-caps
          icon="add"
          class="sc-btn-outline chip"
          :label="tiebreakName(c)"
          :aria-label="$t('competition.tiebreak.add', { name: tiebreakName(c) })"
          :disable="saving"
          @click="toggle(c)"
        />
      </div>

      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="close" />
        <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.sub {
  margin: 18px 0 6px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.chip {
  min-height: 40px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.row-name {
  font-size: 18px;
}

.units {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.unit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--sc-line-strong);
  border-radius: 10px;
  background: var(--sc-bg);
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.unit--on {
  border-color: var(--sc-accent);
  box-shadow: inset 0 0 0 1px var(--sc-accent);
}

.unit-name {
  font-size: 18px;
}

.empty {
  margin-top: 8px;
}

.tb-actions {
  display: flex;
  flex-shrink: 0;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 18px;
}
</style>
