<script lang="ts">
import { type Game, type Sport, TEAM_COUNT, type TeamPlayer, type Teams } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { useAuthStore } from '../../auth/auth.store';
import {
  draftOf,
  emptyDraft,
  everyone,
  moveTo,
  setGamePositions,
  setTeamCount,
  type TeamPlayerChange,
  type TeamsDraft,
  teamIndexOf,
} from '../teams';
import { teamsApi } from '../teams.api';
import TeamPlayerSheet from './TeamPlayerSheet.vue';
import TeamsView from './TeamsView.vue';

/**
 * Card "Times" da aba Jogo (TIM-14). O dono monta, move por toque, muda a quantidade, publica, volta para rascunho
 * e descarta; cada mudança é salva na hora (TIM-09). Quem não é dono só vê os times publicados.
 * Recarrega quando o jogo muda (qualquer ação da página recarrega o jogo).
 */
export default defineComponent({
  name: 'TeamsCard',

  components: { TeamPlayerSheet, TeamsView },

  props: {
    groupId: { type: String, required: true },
    game: { type: Object as PropType<Game>, required: true },
    sport: { type: String as PropType<Sport>, required: true },
    isOwner: { type: Boolean, default: false },
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      teams: undefined as Teams | null | undefined,
      busy: false,
      sheetOpen: false,
      selectedId: '',
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

    /** Sem times publicados, quem não é dono não vê o card (TIM-14). */
    visible(): boolean {
      return this.isOwner ? this.teams !== undefined : Boolean(this.teams);
    },
  },

  watch: {
    game: { immediate: true, handler: 'load' },
  },

  methods: {
    async load() {
      try {
        this.teams = (await teamsApi.teams(this.groupId, this.game.date)).teams;
      } catch {
        // Sem os times a página continua funcionando; o card só não aparece.
        this.teams = undefined;
      }
    },

    async run(action: () => Promise<{ teams: Teams | null } | undefined>, success?: string) {
      this.busy = true;
      try {
        const res = await action();
        this.teams = res ? res.teams : null;
        if (success) this.$q.notify({ type: 'positive', message: success });
        return true;
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return false;
      } finally {
        this.busy = false;
      }
    },

    save(draft: TeamsDraft) {
      return this.run(() => teamsApi.saveTeams(this.groupId, this.game.date, draft));
    },

    build() {
      return this.save(emptyDraft());
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
      const ok = await this.save(setGamePositions(moved, change.userId, change.positions));
      if (ok) this.sheetOpen = false;
    },

    publish() {
      return this.run(
        () => teamsApi.publishTeams(this.groupId, this.game.date),
        this.$t('teams.publishedToast'),
      );
    },

    unpublish() {
      return this.run(() => teamsApi.unpublishTeams(this.groupId, this.game.date));
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
            await teamsApi.discardTeams(this.groupId, this.game.date);
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
        v-if="isOwner && teams"
        class="sc-label status"
        :class="{ 'status--published': teams.status === 'published' }"
      >
        {{ teams.status === 'published' ? $t('teams.published') : $t('teams.draft') }}
      </span>
      <template v-if="isOwner && teams">
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

    <div v-if="isOwner && !teams" class="sc-card empty">
      <div class="sc-caption">{{ $t('teams.buildHint') }}</div>
      <q-btn
        color="primary"
        unelevated
        no-caps
        class="sc-btn-outline build"
        icon="groups"
        :label="$t('teams.build')"
        :loading="busy"
        @click="build"
      />
    </div>

    <template v-else-if="teams">
      <div v-if="isOwner && teams.status === 'draft'" class="sc-caption hint">{{ $t('teams.draftHint') }}</div>
      <TeamsView :teams="teams" :editable="isOwner" :me-id="meId" @select="select" />

      <div v-if="isOwner" class="actions">
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
        v-if="isOwner"
        v-model="sheetOpen"
        :player="selected"
        :team="selectedTeam"
        :team-count="count"
        :sport="sport"
        :saving="busy"
        @save="onChange"
      />
    </template>
  </section>
</template>

<style scoped>
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

.actions {
  margin-top: 4px;
}
</style>
