<script lang="ts">
import {
  type Group,
  type Player,
  TEAM_APART_LIMITS,
  TEAM_COUNT,
  TEAM_RULE_LIMITS,
  type TeamApartRule,
  type TeamRule,
  type TeamRuleTarget,
  type TeamSettings,
  teamRuleKey,
  type UpdateTeamSettingsInput,
} from '@scorely/contracts';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import TeamApartSheet, {
  type ApartOption,
} from '@scorely/web/src/modules/teams/components/TeamApartSheet.vue';
import TeamRuleSheet from '@scorely/web/src/modules/teams/components/TeamRuleSheet.vue';
import { putRule, removeRule, ruleText, type Text, targetText } from '@scorely/web/src/modules/teams/rules';
import { teamsApi } from '@scorely/web/src/modules/teams/teams.api';
import { defineComponent, type PropType } from 'vue';

/** A configuração sem os nomes (o que o PUT recebe). */
function inputOf(s: TeamSettings): UpdateTeamSettingsInput {
  return {
    teamCount: s.teamCount,
    rules: s.rules,
    apart: s.apart,
    spreadGender: s.spreadGender,
    allowOutsideRules: s.allowOutsideRules,
  };
}

/**
 * Card "Times" nos Ajustes (TIM-21): quantidade padrão de times, as regras de quantidade por time, os times opostos,
 * "espalhar homens e mulheres" e "permitir publicar fora das regras" (TIM-17, 18, 22, 23). Cada mudança salva a
 * configuração inteira na hora.
 */
export default defineComponent({
  name: 'TeamSettingsCard',

  components: { HoursStepper, TeamApartSheet, TeamRuleSheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      settings: undefined as TeamSettings | undefined,
      saving: false,
      sheetOpen: false,
      editing: undefined as TeamRule | undefined,
      players: [] as Player[],
      apartOpen: false,
      /** Índice da regra de opostos em edição; `undefined` = nova. */
      apartIndex: undefined as number | undefined,
    };
  },

  computed: {
    canAdd(): boolean {
      return (this.settings?.rules.length ?? 0) < TEAM_RULE_LIMITS.rules;
    },

    canAddApart(): boolean {
      return (this.settings?.apart.length ?? 0) < TEAM_APART_LIMITS.rules;
    },

    apartRule(): TeamApartRule | undefined {
      return this.apartIndex === undefined ? undefined : this.settings?.apart[this.apartIndex];
    },

    /** TIM-22: quem o dono pode classificar (TIM-04) e, depois, quem já está nas regras e saiu do grupo. */
    apartOptions(): ApartOption[] {
      const listed = this.players.map((p) => ({
        userId: p.userId,
        name: p.name ?? this.$t('groups.unnamed'),
      }));
      const known = new Set(listed.map((p) => p.userId));
      const inRules = [...new Set((this.settings?.apart ?? []).flatMap((r) => r.people))]
        .filter((id) => !known.has(id))
        .map((userId) => ({ userId, name: this.nameOf(userId) }));
      return [...listed, ...inRules];
    },
  },

  watch: {
    'group.id': { immediate: true, handler: 'load' },
  },

  methods: {
    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    ruleLine(rule: TeamRule): string {
      return `${this.text(targetText(rule.target))}: ${this.text(ruleText(rule))}`;
    },

    key(rule: TeamRule): string {
      return teamRuleKey(rule.target);
    },

    nameOf(userId: string): string {
      return (
        this.settings?.names[userId] ??
        this.players.find((p) => p.userId === userId)?.name ??
        this.$t('groups.unnamed')
      );
    },

    /** "Ana × Bia × Carla". */
    apartLine(rule: TeamApartRule): string {
      return rule.people.map((id) => this.nameOf(id)).join(' × ');
    },

    async load() {
      try {
        const [settings, players] = await Promise.all([
          teamsApi.settings(this.group.id),
          teamsApi.players(this.group.id),
        ]);
        this.settings = settings;
        this.players = players;
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    async put(next: TeamSettings): Promise<boolean> {
      this.saving = true;
      try {
        this.settings = await teamsApi.updateSettings(this.group.id, inputOf(next));
        this.$q.notify({ type: 'positive', message: this.$t('teams.settings.saved') });
        return true;
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return false;
      } finally {
        this.saving = false;
      }
    },

    stepCount(dir: 1 | -1) {
      if (!this.settings) return;
      const teamCount = Math.min(TEAM_COUNT.max, Math.max(TEAM_COUNT.min, this.settings.teamCount + dir));
      if (teamCount !== this.settings.teamCount) void this.put({ ...this.settings, teamCount });
    },

    setAllow(allowOutsideRules: boolean) {
      if (this.settings) void this.put({ ...this.settings, allowOutsideRules });
    },

    setSpread(spreadGender: boolean) {
      if (this.settings) void this.put({ ...this.settings, spreadGender });
    },

    openApart(index?: number) {
      this.apartIndex = index;
      this.apartOpen = true;
    },

    async saveApart(rule: TeamApartRule) {
      if (!this.settings) return;
      const index = this.apartIndex;
      const apart =
        index === undefined
          ? [...this.settings.apart, rule]
          : this.settings.apart.map((r, i) => (i === index ? rule : r));
      if (await this.put({ ...this.settings, apart })) this.apartOpen = false;
    },

    async removeApart() {
      if (!this.settings || this.apartIndex === undefined) return;
      const index = this.apartIndex;
      if (await this.put({ ...this.settings, apart: this.settings.apart.filter((_, i) => i !== index) })) {
        this.apartOpen = false;
      }
    },

    open(rule?: TeamRule) {
      this.editing = rule;
      this.sheetOpen = true;
    },

    async saveRule(rule: TeamRule, previous: TeamRuleTarget | undefined) {
      if (!this.settings) return;
      if (await this.put({ ...this.settings, rules: putRule(this.settings.rules, rule, previous) })) {
        this.sheetOpen = false;
      }
    },

    async remove(target: TeamRuleTarget) {
      if (!this.settings) return;
      if (await this.put({ ...this.settings, rules: removeRule(this.settings.rules, target) })) {
        this.sheetOpen = false;
      }
    },
  },
});
</script>

<template>
  <section v-if="settings">
    <h2 class="sc-section">{{ $t('teams.settings.title') }}</h2>
    <div class="sc-caption">{{ $t('teams.settings.hint') }}</div>

    <div class="sc-card box">
      <div class="row">
        <div>
          <div class="sc-display row-name">{{ $t('teams.settings.defaultCount') }}</div>
          <div class="sc-caption">{{ $t('teams.settings.defaultCountHint') }}</div>
        </div>
        <HoursStepper
          :value="settings.teamCount"
          :disable="saving"
          :dec-label="$t('teams.fewer')"
          :inc-label="$t('teams.more')"
          @step="stepCount"
        />
      </div>

      <div class="rules">
        <div v-if="settings.rules.length === 0" class="sc-caption">{{ $t('teams.settings.noRules') }}</div>
        <button
          v-for="rule in settings.rules"
          :key="key(rule)"
          type="button"
          class="sc-row rule"
          :disabled="saving"
          @click="open(rule)"
        >
          <q-icon name="rule" size="18px" class="rule-icon" />
          <span class="rule-text">{{ ruleLine(rule) }}</span>
          <q-icon name="chevron_right" size="18px" />
        </button>
        <q-btn
          v-if="canAdd"
          flat
          no-caps
          color="primary"
          icon="add"
          class="add"
          :label="$t('teams.settings.addRule')"
          :disable="saving"
          @click="open()"
        />
      </div>

      <div class="rules">
        <div class="sc-display row-name">{{ $t('teams.settings.apartTitle') }}</div>
        <div class="sc-caption">{{ $t('teams.settings.apartHint') }}</div>
        <div v-if="settings.apart.length === 0" class="sc-caption">{{ $t('teams.settings.noApart') }}</div>
        <button
          v-for="(rule, i) in settings.apart"
          :key="rule.people.join()"
          type="button"
          class="sc-row rule"
          :disabled="saving"
          @click="openApart(i)"
        >
          <q-icon name="call_split" size="18px" class="rule-icon" />
          <span class="rule-text">{{ apartLine(rule) }}</span>
          <q-icon name="chevron_right" size="18px" />
        </button>
        <q-btn
          v-if="canAddApart"
          flat
          no-caps
          color="primary"
          icon="add"
          class="add"
          :label="$t('teams.settings.addApart')"
          :disable="saving"
          @click="openApart()"
        />
      </div>

      <q-toggle
        :model-value="settings.spreadGender"
        :label="$t('teams.settings.spreadGender')"
        :disable="saving"
        @update:model-value="setSpread"
      />
      <div class="sc-caption allow-hint">{{ $t('teams.settings.spreadGenderHint') }}</div>

      <q-toggle
        :model-value="settings.allowOutsideRules"
        :label="$t('teams.settings.allowOutside')"
        :disable="saving"
        @update:model-value="setAllow"
      />
      <div class="sc-caption allow-hint">{{ $t('teams.settings.allowOutsideHint') }}</div>
    </div>

    <TeamRuleSheet
      v-model="sheetOpen"
      :sport="group.sport"
      :rules="settings.rules"
      :rule="editing"
      :saving="saving"
      @save="saveRule"
      @remove="remove"
    />

    <TeamApartSheet
      v-model="apartOpen"
      :people="apartOptions"
      :rule="apartRule"
      :saving="saving"
      @save="saveApart"
      @remove="removeApart"
    />
  </section>
</template>

<style scoped>
.box {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--sc-line);
}

.row-name {
  font-size: 20px;
}

.rules {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--sc-line);
}

.rule {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  background: none;
  border: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.rule-text {
  flex: 1;
  min-width: 0;
}

.rule-icon {
  color: var(--sc-accent);
}

.add {
  align-self: flex-start;
  min-height: 44px;
}

.allow-hint {
  margin-top: -4px;
}
</style>
