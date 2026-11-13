<script lang="ts">
import {
  type Group,
  type Player,
  type PublicUserId,
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
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import TeamApartEditor, {
  type ApartOption,
} from '@scorely/web/src/modules/teams/components/TeamApartEditor.vue';
import TeamRuleEditor from '@scorely/web/src/modules/teams/components/TeamRuleEditor.vue';
import { putRule, removeRule, ruleText, type Text, targetText } from '@scorely/web/src/modules/teams/rules';
import { teamApartSummary, teamCountSummary, teamRulesSummary } from '@scorely/web/src/modules/teams/teams';
import { teamsApi } from '@scorely/web/src/modules/teams/teams.api';
import { defineComponent, type PropType } from 'vue';

/** Qual painel está aberto. */
type Sheet = 'count' | 'rules' | 'apart' | null;

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
 * As 3 linhas de times dos Ajustes (TIM-21, GRP-29), cada uma com o seu painel de baixo:
 * - Times: quantidade padrão, "espalhar homens e mulheres" e "permitir publicar fora das regras" (TIM-17, 23);
 * - Regras dos times: a lista e, no mesmo painel, o editor de uma regra (TIM-18);
 * - Times opostos: a lista e, no mesmo painel, o editor de uma regra (TIM-22).
 * Cada mudança salva a configuração inteira na hora. Salvar ou remover no editor volta para a lista.
 */
export default defineComponent({
  name: 'TeamSettingsRows',

  components: { BottomSheet, HoursStepper, SettingsRow, TeamApartEditor, TeamRuleEditor },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      settings: undefined as TeamSettings | undefined,
      players: [] as Player[],
      saving: false,
      sheet: null as Sheet,
      /** Editor aberto dentro do painel de regras; `editing` = a regra (sem ela, uma nova). */
      ruleEditor: false,
      editing: undefined as TeamRule | undefined,
      /** Editor aberto dentro do painel de opostos; `apartIndex` = a regra (sem ele, uma nova). */
      apartEditor: false,
      apartIndex: undefined as number | undefined,
    };
  },

  computed: {
    countSummary(): string {
      return this.settings ? teamCountSummary(this.settings).map(this.text).join(' · ') : '';
    },

    rulesSummary(): string {
      return this.settings ? this.text(teamRulesSummary(this.settings)) : '';
    },

    apartSummary(): string {
      return this.settings ? this.text(teamApartSummary(this.settings)) : '';
    },

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

    nameOf(userId: PublicUserId): string {
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

    /** Abre um painel sempre na lista, nunca no editor. */
    openSheet(sheet: Sheet) {
      if (!this.settings) return;
      this.ruleEditor = false;
      this.apartEditor = false;
      this.sheet = sheet;
    },

    setSheet(open: boolean, sheet: Sheet) {
      this.sheet = open ? sheet : null;
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

    openRule(rule?: TeamRule) {
      this.editing = rule;
      this.ruleEditor = true;
    },

    async saveRule(rule: TeamRule, previous: TeamRuleTarget | undefined) {
      if (!this.settings) return;
      if (await this.put({ ...this.settings, rules: putRule(this.settings.rules, rule, previous) })) {
        this.ruleEditor = false;
      }
    },

    async removeRule(target: TeamRuleTarget) {
      if (!this.settings) return;
      if (await this.put({ ...this.settings, rules: removeRule(this.settings.rules, target) })) {
        this.ruleEditor = false;
      }
    },

    openApart(index?: number) {
      this.apartIndex = index;
      this.apartEditor = true;
    },

    async saveApart(rule: TeamApartRule) {
      if (!this.settings) return;
      const index = this.apartIndex;
      const apart =
        index === undefined
          ? [...this.settings.apart, rule]
          : this.settings.apart.map((r, i) => (i === index ? rule : r));
      if (await this.put({ ...this.settings, apart })) this.apartEditor = false;
    },

    async removeApart() {
      if (!this.settings || this.apartIndex === undefined) return;
      const index = this.apartIndex;
      if (await this.put({ ...this.settings, apart: this.settings.apart.filter((_, i) => i !== index) })) {
        this.apartEditor = false;
      }
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow
      icon="groups"
      :title="$t('groups.settings.rows.teams')"
      :summary="countSummary"
      @open="openSheet('count')"
    />
    <SettingsRow
      icon="rule"
      :title="$t('groups.settings.rows.teamRules')"
      :summary="rulesSummary"
      @open="openSheet('rules')"
    />
    <SettingsRow
      icon="call_split"
      :title="$t('groups.settings.rows.teamApart')"
      :summary="apartSummary"
      @open="openSheet('apart')"
    />

    <template v-if="settings">
      <BottomSheet
        :model-value="sheet === 'count'"
        :title="$t('groups.settings.rows.teams')"
        :persistent="saving"
        @update:model-value="setSheet($event, 'count')"
      >
        <div class="sc-caption q-mt-xs">{{ $t('teams.settings.hint') }}</div>
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
        <q-toggle
          :model-value="settings.spreadGender"
          :label="$t('teams.settings.spreadGender')"
          :disable="saving"
          @update:model-value="setSpread"
        />
        <div class="sc-caption toggle-hint">{{ $t('teams.settings.spreadGenderHint') }}</div>
        <q-toggle
          :model-value="settings.allowOutsideRules"
          :label="$t('teams.settings.allowOutside')"
          :disable="saving"
          @update:model-value="setAllow"
        />
        <div class="sc-caption toggle-hint">{{ $t('teams.settings.allowOutsideHint') }}</div>
      </BottomSheet>

      <BottomSheet
        :model-value="sheet === 'rules'"
        :title="$t('groups.settings.rows.teamRules')"
        :persistent="saving"
        @update:model-value="setSheet($event, 'rules')"
      >
        <TeamRuleEditor
          v-if="ruleEditor"
          :sport="group.sport"
          :rules="settings.rules"
          :rule="editing"
          :saving="saving"
          @save="saveRule"
          @remove="removeRule"
          @back="ruleEditor = false"
        />
        <div v-else class="list">
          <div class="sc-caption">{{ $t('teams.settings.hint') }}</div>
          <div v-if="settings.rules.length === 0" class="sc-caption">{{ $t('teams.settings.noRules') }}</div>
          <button
            v-for="rule in settings.rules"
            :key="key(rule)"
            type="button"
            class="sc-row item"
            :disabled="saving"
            @click="openRule(rule)"
          >
            <q-icon name="rule" size="18px" class="item-icon" />
            <span class="item-text">{{ ruleLine(rule) }}</span>
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
            @click="openRule()"
          />
        </div>
      </BottomSheet>

      <BottomSheet
        :model-value="sheet === 'apart'"
        :title="$t('groups.settings.rows.teamApart')"
        :persistent="saving"
        @update:model-value="setSheet($event, 'apart')"
      >
        <TeamApartEditor
          v-if="apartEditor"
          :people="apartOptions"
          :rule="apartRule"
          :saving="saving"
          @save="saveApart"
          @remove="removeApart"
          @back="apartEditor = false"
        />
        <div v-else class="list">
          <div class="sc-caption">{{ $t('teams.settings.apartHint') }}</div>
          <div v-if="settings.apart.length === 0" class="sc-caption">{{ $t('teams.settings.noApart') }}</div>
          <button
            v-for="(rule, i) in settings.apart"
            :key="rule.people.join()"
            type="button"
            class="sc-row item"
            :disabled="saving"
            @click="openApart(i)"
          >
            <q-icon name="call_split" size="18px" class="item-icon" />
            <span class="item-text">{{ apartLine(rule) }}</span>
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
      </BottomSheet>
    </template>
  </section>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--sc-line);
}

.row-name {
  font-size: 20px;
}

.toggle-hint {
  margin-top: -4px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--sc-line);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.item-text {
  flex: 1;
  min-width: 0;
}

.item-icon {
  color: var(--sc-accent);
}

.add {
  align-self: flex-start;
  min-height: 44px;
}
</style>
