<script lang="ts">
import {
  ErrorDetailsSchemas,
  type Game,
  TEAM_COUNT,
  TEAM_EXTRA_LIMITS,
  type TeamExtra,
  type TeamPlayer,
  type TeamRuleConflict,
  type Teams,
} from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { useSportsStore } from '@scorely/web/src/modules/sports/sports.store';
import TeamExtraSheet from '@scorely/web/src/modules/teams/components/TeamExtraSheet.vue';
import TeamPlayerSheet from '@scorely/web/src/modules/teams/components/TeamPlayerSheet.vue';
import TeamsView from '@scorely/web/src/modules/teams/components/TeamsView.vue';
import {
  conflictText,
  joinNames,
  namesIn,
  type Text,
  targetText,
} from '@scorely/web/src/modules/teams/rules';
import {
  draftOf,
  emptyDraft,
  everyone,
  extraOf,
  moveTo,
  putExtra,
  removeExtra,
  setGamePositions,
  setPinned,
  setTeamCount,
  type TeamPlayerChange,
  type TeamsDraft,
  teamIndexOf,
} from '@scorely/web/src/modules/teams/teams';
import { teamsApi } from '@scorely/web/src/modules/teams/teams.api';
import { defineComponent, type PropType } from 'vue';

/** TIM-19: os conflitos de um TEAM_RULES_CONFLICT; outro erro → `undefined`. */
function conflictsOf(err: unknown): TeamRuleConflict[] | undefined {
  if (!(err instanceof ApiRequestError) || err.code !== 'TEAM_RULES_CONFLICT') return undefined;
  const parsed = ErrorDetailsSchemas.TEAM_RULES_CONFLICT.safeParse(err.details);
  return parsed.success ? parsed.data.conflicts : undefined;
}

/**
 * Os times do jogo, na aba Times (TIM-14). O dono monta, move por toque, muda a quantidade, publica, volta para rascunho
 * e descarta; sorteia (TIM-15) com quem está fixo (TIM-16); cada mudança é salva na hora (TIM-09). Quem não é dono só vê os times publicados.
 * Recarrega quando o jogo muda (qualquer ação da página recarrega o jogo).
 */
export default defineComponent({
  name: 'TeamsCard',

  components: { TeamExtraSheet, TeamPlayerSheet, TeamsView },

  inject: permissionLostInject,

  props: {
    groupId: { type: String, required: true },
    game: { type: Object as PropType<Game>, required: true },
    sportId: { type: String, required: true },
    canManage: { type: Boolean, default: false },
  },

  setup() {
    return { sports: useSportsStore(), auth: useAuthStore() };
  },

  data() {
    return {
      teams: undefined as Teams | null | undefined,
      /** Quantidade padrão do grupo (TIM-17), para "Montar à mão". */
      defaultTeamCount: TEAM_COUNT.min as number,
      /** O que impediu o último sorteio (TIM-19). */
      conflicts: [] as TeamRuleConflict[],
      busy: false,
      sheetOpen: false,
      selectedId: '',
      extraOpen: false,
      /** O avulso em edição; `undefined` = novo (TIM-24). */
      editingExtra: undefined as TeamExtra | undefined,
    };
  },

  computed: {
    meId(): string {
      return this.auth.user?.id ?? '';
    },

    draft(): TeamsDraft | undefined {
      return this.teams ? draftOf(this.teams) : undefined;
    },

    selected(): TeamPlayer | undefined {
      return this.teams ? everyone(this.teams).find((p) => p.userId === this.selectedId) : undefined;
    },

    selectedTeam(): number | undefined {
      return this.draft ? teamIndexOf(this.draft, this.selectedId) : undefined;
    },

    count(): number {
      return this.teams?.teams.length ?? TEAM_COUNT.min;
    },

    canFewer(): boolean {
      return this.count > TEAM_COUNT.min;
    },

    canMore(): boolean {
      return this.count < TEAM_COUNT.max;
    },

    /** Já há alguém num time: o botão vira "Sortear de novo". */
    anyPlaced(): boolean {
      return Boolean(this.teams?.teams.some((team) => team.length > 0));
    },

    canAddExtra(): boolean {
      return (this.draft?.extras?.length ?? 0) < TEAM_EXTRA_LIMITS.perGame;
    },

    /** Carregou (com ou sem times). Sem times publicados, quem não é dono vê o aviso (TIM-14). */
    visible(): boolean {
      return this.teams !== undefined;
    },
  },

  watch: {
    game: { immediate: true, handler: 'load' },
    /** GRP-57: a permissão mudou (a página recarregou): relê, porque o rascunho só aparece para quem monta (TIM-09). */
    canManage: 'load',
  },

  methods: {
    async load() {
      try {
        const res = await teamsApi.teams(this.groupId, this.game.id);
        this.teams = res.teams;
        this.defaultTeamCount = res.defaultTeamCount ?? TEAM_COUNT.min;
      } catch {
        // Sem os times a página continua funcionando; a aba só fica vazia.
        this.teams = undefined;
      }
    },

    async run(action: () => Promise<{ teams: Teams | null } | undefined>, success?: string) {
      this.busy = true;
      try {
        const res = await action();
        this.teams = res ? res.teams : null;
        this.conflicts = [];
        if (success) this.$q.notify({ type: 'positive', message: success });
        return true;
      } catch (err) {
        // GRP-57: sem a permissão, os painéis fecham e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) {
          this.sheetOpen = false;
          this.extraOpen = false;
          this.conflicts = [];
          return false;
        }
        const conflicts = conflictsOf(err);
        if (conflicts) this.conflicts = conflicts;
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return false;
      } finally {
        this.busy = false;
      }
    },

    save(draft: TeamsDraft) {
      return this.run(() => teamsApi.saveTeams(this.groupId, this.game.id, { ...draft, ...this.version() }));
    },

    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    /** TIM-19: "Levantador: precisa de 3, e o sorteio tem 2". */
    conflictLine(c: TeamRuleConflict): string {
      if (c.reason === 'apart_too_many' || c.reason === 'apart_pinned') {
        // No 1º sorteio ainda não há times: os nomes vêm da lista do jogo.
        const people = [
          ...(this.teams ? everyone(this.teams) : []),
          ...this.game.confirmed,
          ...this.game.waitlist,
        ];
        const names = namesIn(people, c.people);
        return this.text(conflictText(c, joinNames(names, this.$t('teams.rules.and'))));
      }
      const reason = this.text(conflictText(c));
      return c.reason === 'unsolvable'
        ? reason
        : `${this.text(targetText(c.rule.target, (id) => this.sports.positionName(this.sportId, id)))}: ${reason}`;
    },

    build() {
      return this.save(emptyDraft(this.defaultTeamCount));
    },

    changeCount(delta: number) {
      if (this.draft) return this.save(setTeamCount(this.draft, this.count + delta));
      return undefined;
    },

    select(userId: string) {
      this.selectedId = userId;
      this.sheetOpen = true;
    },

    async onChange(change: TeamPlayerChange) {
      if (!this.draft) return;
      const moved = moveTo(this.draft, change.userId, change.team);
      const pinned = setPinned(moved, change.userId, change.pinned);
      const ok = await this.save(setGamePositions(pinned, change.userId, change.positions));
      if (ok) this.sheetOpen = false;
    },

    /** TIM-24: "+ Avulso" (novo) ou "Editar avulso" no painel da pessoa. */
    openExtra(id?: string) {
      this.editingExtra = id && this.draft ? extraOf(this.draft, id) : undefined;
      this.sheetOpen = false;
      this.extraOpen = true;
    },

    async saveExtra(extra: TeamExtra) {
      if (!this.draft) return;
      if (await this.save(putExtra(this.draft, extra))) this.extraOpen = false;
    },

    async removeSelectedExtra() {
      if (!this.draft) return;
      if (await this.save(removeExtra(this.draft, this.selectedId))) this.sheetOpen = false;
    },

    async deleteExtra(id: string) {
      if (!this.draft) return;
      if (await this.save(removeExtra(this.draft, id))) this.extraOpen = false;
    },

    /** TIM-25: a versão dos times que a tela mostra (0 = o jogo ainda sem times). */
    version(): { version: number } {
      return { version: this.teams?.version ?? 0 };
    },

    /** TIM-15: com os times publicados, confirma antes (eles voltam para rascunho). */
    draw() {
      const run = () => this.run(() => teamsApi.drawTeams(this.groupId, this.game.id, this.version()));
      if (this.teams?.status !== 'published') return run();
      this.$q
        .dialog({
          message: this.$t('teams.drawConfirm'),
          cancel: { label: this.$t('groups.no'), flat: true },
          ok: { label: this.$t('groups.yes'), color: 'primary' },
          persistent: true,
        })
        .onOk(() => {
          void run();
        });
      return undefined;
    },

    publish() {
      return this.run(
        () => teamsApi.publishTeams(this.groupId, this.game.id, this.version()),
        this.$t('teams.publishedToast'),
      );
    },

    unpublish() {
      return this.run(() => teamsApi.unpublishTeams(this.groupId, this.game.id, this.version()));
    },

    discard() {
      this.$q
        .dialog({
          message: this.$t('teams.discardConfirm'),
          cancel: { label: this.$t('groups.no'), flat: true },
          ok: { label: this.$t('groups.yes'), color: 'primary' },
          persistent: true,
        })
        .onOk(() => {
          void this.run(async () => {
            await teamsApi.discardTeams(this.groupId, this.game.id, this.version());
            return undefined;
          });
        });
    },
  },
});
</script>

<template>
  <section v-if="visible" class="teams-card">
    <div class="head">
      <h2 class="sc-section title">{{ $t('teams.cardTitle') }}</h2>
      <span
        v-if="canManage && teams"
        class="sc-label status"
        :class="{ 'status--published': teams.status === 'published' }"
      >
        {{ teams.status === 'published' ? $t('teams.published') : $t('teams.draft') }}
      </span>
      <template v-if="canManage && teams">
        <div class="stepper">
          <q-btn
            flat
            round
            dense
            icon="remove"
            :aria-label="$t('teams.fewer')"
            :disable="busy || !canFewer"
            @click="changeCount(-1)"
          />
          <span class="sc-label stepper-value">{{ $t('teams.count', { count }) }}</span>
          <q-btn
            flat
            round
            dense
            icon="add"
            :aria-label="$t('teams.more')"
            :disable="busy || !canMore"
            @click="changeCount(1)"
          />
        </div>
        <q-btn
          v-if="canAddExtra"
          flat
          dense
          no-caps
          color="primary"
          icon="person_add"
          :label="$t('teams.extra.add')"
          :disable="busy"
          @click="openExtra()"
        />
        <q-btn flat round dense icon="more_vert" :aria-label="$t('teams.moreActions')" :disable="busy">
          <q-menu anchor="bottom right" self="top right">
            <q-list style="min-width: 200px">
              <q-item v-close-popup clickable class="sc-danger" @click="discard">
                <q-item-section avatar><q-icon name="delete_outline" /></q-item-section>
                <q-item-section>{{ $t('teams.discard') }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </template>
    </div>

    <div v-if="canManage && conflicts.length > 0" class="sc-card conflicts" role="alert">
      <div class="conflicts-head">
        <q-icon name="error_outline" size="18px" />
        <span class="sc-display conflicts-title">{{ $t('teams.rules.conflictTitle') }}</span>
        <q-btn flat round dense icon="close" size="sm" :aria-label="$t('groups.cancel')" @click="conflicts = []" />
      </div>
      <ul class="conflicts-list">
        <li v-for="(c, i) in conflicts" :key="i">{{ conflictLine(c) }}</li>
      </ul>
      <div class="sc-caption">{{ $t('teams.rules.conflictHint') }}</div>
    </div>

    <div v-if="canManage && !teams" class="sc-card empty">
      <div class="sc-caption">{{ $t('teams.buildHint') }}</div>
      <div class="empty-actions">
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main build"
          icon="shuffle"
          :label="$t('teams.draw')"
          :loading="busy"
          @click="draw"
        />
        <q-btn
          flat
          no-caps
          class="sc-btn-outline build"
          icon="groups"
          :label="$t('teams.build')"
          :disable="busy"
          @click="build"
        />
      </div>
    </div>

    <div v-else-if="!teams" class="sc-card sc-caption not-yet">{{ $t('teams.empty.notYet') }}</div>

    <template v-else>
      <div v-if="canManage && teams.status === 'draft'" class="sc-caption hint">{{ $t('teams.draftHint') }}</div>
      <TeamsView :teams="teams" :sport-id="sportId" :editable="canManage" :me-id="meId" @select="select" />

      <div v-if="canManage" class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline full-width"
          icon="shuffle"
          :label="anyPlaced ? $t('teams.drawAgain') : $t('teams.draw')"
          :disable="busy"
          @click="draw"
        />
        <q-btn
          v-if="teams.status === 'draft'"
          color="primary"
          unelevated
          class="sc-btn-main full-width"
          :label="$t('teams.publish')"
          :loading="busy"
          @click="publish"
        />
        <q-btn
          v-else
          flat
          no-caps
          class="sc-btn-outline full-width"
          :label="$t('teams.unpublish')"
          :disable="busy"
          @click="unpublish"
        />
      </div>

      <TeamPlayerSheet
        v-if="canManage"
        v-model="sheetOpen"
        :player="selected"
        :team="selectedTeam"
        :team-count="count"
        :sport-id="sportId"
        :saving="busy"
        @save="onChange"
        @edit-extra="openExtra(selectedId)"
        @remove-extra="removeSelectedExtra"
      />

      <TeamExtraSheet
        v-if="canManage"
        v-model="extraOpen"
        :sport-id="sportId"
        :extra="editingExtra"
        :saving="busy"
        @save="saveExtra"
        @remove="deleteExtra"
      />
    </template>
  </section>
</template>

<style scoped>
.not-yet {
  padding: 24px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

.conflicts {
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--sc-danger-line);
  background: var(--sc-danger-soft);
}

.conflicts-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sc-danger);
}

.conflicts-title {
  flex: 1;
  font-size: 16px;
}

.conflicts-list {
  margin: 8px 0;
  padding-left: 18px;
}

.teams-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title {
  margin-bottom: 0;
}

.status {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--sc-line-strong);
  border-radius: 999px;
  color: var(--sc-muted);
}

.status--published {
  border-color: var(--sc-accent);
  color: var(--sc-accent);
}

.stepper {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
}

.stepper-value {
  font-size: 12px;
  min-width: 56px;
  text-align: center;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 14px;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

.build {
  min-height: 44px;
}

.hint {
  margin-top: -4px;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
</style>
