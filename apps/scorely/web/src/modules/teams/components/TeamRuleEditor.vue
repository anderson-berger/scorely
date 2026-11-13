<script lang="ts">
import {
  type Sport,
  TEAM_RULE_LIMITS,
  type TeamRule,
  TeamRuleSchema,
  type TeamRuleTarget,
  teamRuleKey,
} from '@scorely/contracts';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { availableTargets, type Text, targetText } from '@scorely/web/src/modules/teams/rules';
import { defineComponent, type PropType } from 'vue';

type Bound = 'min' | 'max';

/**
 * Editor de uma regra de quantidade por time (TIM-21), dentro do painel Regras dos times: quem conta (posição do esporte
 * ou gênero), mínimo e máximo (cada um pode ficar sem valor). Numa regra que já existe, também Remover. Voltar volta para
 * a lista do mesmo painel. Quem chama salva a configuração.
 */
export default defineComponent({
  name: 'TeamRuleEditor',

  components: { HoursStepper },

  props: {
    sport: { type: String as PropType<Sport>, required: true },
    /** As regras do grupo: o que já tem regra não aparece para escolher. */
    rules: { type: Array as PropType<TeamRule[]>, required: true },
    /** A regra em edição; sem ela, é uma regra nova. */
    rule: { type: Object as PropType<TeamRule | undefined>, default: undefined },
    saving: { type: Boolean, default: false },
  },

  emits: {
    back: () => true,
    save: (_rule: TeamRule, _previous: TeamRuleTarget | undefined) => true,
    remove: (_target: TeamRuleTarget) => true,
  },

  data() {
    return {
      targetKey: '',
      hasMin: true,
      hasMax: false,
      min: 1 as number,
      max: 1 as number,
    };
  },

  computed: {
    bounds(): Bound[] {
      return ['min', 'max'];
    },

    targets(): TeamRuleTarget[] {
      return availableTargets(this.sport, this.rules, this.rule?.target);
    },

    options(): { label: string; value: string }[] {
      return this.targets.map((t) => ({ label: this.text(targetText(t)), value: teamRuleKey(t) }));
    },

    draft(): TeamRule | undefined {
      const target = this.targets.find((t) => teamRuleKey(t) === this.targetKey);
      if (!target) return undefined;
      const parsed = TeamRuleSchema.safeParse({
        target,
        ...(this.hasMin && { min: this.min }),
        ...(this.hasMax && { max: this.max }),
      });
      return parsed.success ? parsed.data : undefined;
    },

    /** Por que não dá para salvar (a regra precisa de um dos dois, e o mínimo não passa do máximo). */
    problem(): string {
      if (!this.hasMin && !this.hasMax) return this.$t('teams.settings.ruleEmpty');
      if (this.hasMin && this.hasMax && this.min > this.max) return this.$t('teams.settings.ruleMinOverMax');
      return '';
    },
  },

  created() {
    const rule = this.rule;
    this.targetKey = rule ? teamRuleKey(rule.target) : (this.options[0]?.value ?? '');
    this.hasMin = rule ? rule.min !== undefined : true;
    this.hasMax = rule ? rule.max !== undefined : false;
    this.min = rule?.min ?? 1;
    this.max = rule?.max ?? rule?.min ?? 1;
  },

  methods: {
    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    step(bound: Bound, dir: 1 | -1) {
      const { min, max } = TEAM_RULE_LIMITS.count;
      const next = Math.min(max, Math.max(min, this[bound] + dir));
      if (bound === 'min') this.min = next;
      else this.max = next;
    },

    save() {
      if (this.draft) this.$emit('save', this.draft, this.rule?.target);
    },
  },
});
</script>

<template>
  <div>
    <h3 class="sc-display title">{{ $t(rule ? 'teams.settings.editRule' : 'teams.settings.addRule') }}</h3>
    <div class="sc-caption q-mt-xs">{{ $t('teams.settings.ruleHint') }}</div>

    <q-select
      v-model="targetKey"
      :options="options"
      emit-value
      map-options
      outlined
      dense
      :label="$t('teams.settings.target')"
      class="target"
    />

    <div v-for="bound in bounds" :key="bound" class="row">
      <q-toggle
        :model-value="bound === 'min' ? hasMin : hasMax"
        :label="$t(`teams.settings.${bound}`)"
        @update:model-value="bound === 'min' ? (hasMin = $event) : (hasMax = $event)"
      />
      <HoursStepper
        v-if="bound === 'min' ? hasMin : hasMax"
        :value="bound === 'min' ? min : max"
        :dec-label="$t('teams.settings.less', { field: $t(`teams.settings.${bound}`) })"
        :inc-label="$t('teams.settings.more', { field: $t(`teams.settings.${bound}`) })"
        @step="step(bound, $event)"
      />
      <span v-else class="sc-caption">{{ $t('teams.settings.noValue') }}</span>
    </div>

    <div v-if="problem" class="sc-caption problem">{{ problem }}</div>

    <q-btn
      v-if="rule"
      flat
      no-caps
      dense
      class="sc-danger remove"
      icon="delete_outline"
      :label="$t('teams.settings.removeRule')"
      :disable="saving"
      @click="$emit('remove', rule.target)"
    />

    <div class="actions">
      <q-btn
        flat
        no-caps
        class="sc-btn-outline"
        :label="$t('teams.settings.back')"
        icon="arrow_back"
        :disable="saving"
        @click="$emit('back')"
      />
      <q-btn
        color="primary"
        unelevated
        class="sc-btn-main"
        :label="$t('groups.save')"
        :loading="saving"
        :disable="!draft"
        @click="save"
      />
    </div>
  </div>
</template>

<style scoped>
.title {
  font-size: 20px;
  margin: 0;
}

.target {
  margin-top: 12px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 56px;
  border-bottom: 1px solid var(--sc-line);
}

.problem {
  margin-top: 8px;
  color: var(--sc-danger);
}

.remove {
  margin-top: 8px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
