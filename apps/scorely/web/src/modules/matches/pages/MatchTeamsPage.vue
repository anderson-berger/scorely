<script lang="ts">
import {
  type Group,
  MATCH_TEAMS_LIMITS,
  type Match,
  type MatchEntry,
  type MatchTeamPlayerRef,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError, isVersionConflict } from '@scorely/web/src/lib/http';
import {
  draftFromLineup,
  drawTeams,
  moveToTeam,
  refKey,
  refOf,
  resizeTeams,
  suggestedTeamCount,
  type TeamsDraft,
  teamOf,
  withoutPlayers,
} from '@scorely/web/src/modules/matches/match.teams';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

interface Person {
  ref: MatchTeamPlayerRef;
  name: string;
  reserve: boolean;
  guest: boolean;
}

/**
 * PAR-30: a tela de dividir. Abre já sorteada (sem times salvos) ou com os times salvos, sem quem saiu da lista e com
 * quem está sem time à parte (PAR-28). Times − +, Sortear, tocar numa pessoa para mover e Salvar (PAR-25, 26).
 */
export default defineComponent({
  name: 'MatchTeamsPage',

  components: { BottomSheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      match: undefined as Match | undefined,
      draft: { teams: [], unassigned: [] } as TeamsDraft,
      /** O draft como abriu (ou como ficou salvo): sem mudança, sair não pergunta. */
      initial: '',
      error: '',
      saving: false,
      /** Sair sem perguntar (salvou, ou a pessoa não tem a permissão). */
      leaving: false,
      moving: undefined as Person | undefined,
      limits: MATCH_TEAMS_LIMITS,
    };
  },

  computed: {
    matchId(): string {
      return String(this.$route.params.matchId ?? '');
    },

    /** Quem pode estar num time: quem está dentro (PAR-25). */
    people(): Map<string, Person> {
      const entries: MatchEntry[] = this.match?.in ?? [];
      return new Map(
        entries.map((e) => {
          const ref = refOf(e);
          const person: Person = {
            ref,
            name: e.kind === 'player' ? e.user.nickname : e.name,
            reserve: e.kind === 'player' && e.tier === 'reserve',
            guest: e.kind === 'guest',
          };
          return [refKey(ref), person];
        }),
      );
    },

    teams(): Person[][] {
      return this.draft.teams.map((team) => this.personsOf(team));
    },

    unassigned(): Person[] {
      return this.personsOf(this.draft.unassigned);
    },

    /** Sem times salvos, o sorteio que abriu ainda não foi salvo. */
    dirty(): boolean {
      return !!this.match && (!this.match.lineup || JSON.stringify(this.draft) !== this.initial);
    },

    hasPlayers(): boolean {
      return this.draft.teams.some((t) => t.length > 0);
    },

    movingTeam(): number | null {
      return this.moving ? teamOf(this.draft, this.moving.ref) : null;
    },
  },

  mounted() {
    this.load();
  },

  beforeRouteLeave(_to, _from, next) {
    if (this.leaving || !this.dirty) {
      next();
      return;
    }
    this.$q
      .dialog({
        title: this.$t('matches.lineup.discardTitle'),
        message: this.$t('matches.lineup.discardMessage'),
        cancel: { label: this.$t('matches.lineup.stay'), flat: true },
        ok: { label: this.$t('matches.lineup.discard'), color: 'negative', flat: true },
      })
      .onOk(() => next())
      .onCancel(() => next(false));
  },

  methods: {
    keyOf(ref: MatchTeamPlayerRef): string {
      return refKey(ref);
    },

    personsOf(refs: readonly MatchTeamPlayerRef[]): Person[] {
      return refs.flatMap((r) => {
        const person = this.people.get(refKey(r));
        return person ? [person] : [];
      });
    },

    async fetch(): Promise<Match | undefined> {
      try {
        return await matchesApi.get(this.group.id, this.matchId);
      } catch (err) {
        this.error = errorMessage(err);
        return undefined;
      }
    },

    /** O começo da tela (PAR-30): os times salvos, ou um sorteio no número sugerido. */
    startFrom(match: Match): TeamsDraft {
      return match.lineup
        ? draftFromLineup(match.lineup)
        : drawTeams(match.in.map(refOf), suggestedTeamCount(match.teams));
    },

    async load() {
      this.error = '';
      const match = await this.fetch();
      if (!match) return;
      if (!match.actions.manageTeams) {
        this.leaving = true;
        this.toMatch();
        return;
      }
      this.match = match;
      this.draft = this.startFrom(match);
      this.initial = JSON.stringify(this.draft);
    },

    resize(delta: number) {
      const count = this.draft.teams.length + delta;
      if (count < this.limits.min || count > this.limits.max) return;
      this.draft = resizeTeams(this.draft, count);
    },

    draw() {
      const everyone = [...this.draft.teams.flat(), ...this.draft.unassigned];
      this.draft = drawTeams(everyone, this.draft.teams.length);
    },

    move(target: number | null) {
      if (this.moving) this.draft = moveToTeam(this.draft, this.moving.ref, target);
      this.moving = undefined;
    },

    async save() {
      if (!this.match) return;
      this.saving = true;
      try {
        await matchesApi.saveTeams(this.group.id, this.matchId, {
          teams: this.draft.teams,
          expectedVersion: this.match.lineup?.version ?? 0,
        });
        this.leaving = true;
        this.$q.notify({ type: 'positive', message: this.$t('matches.lineup.saved') });
        this.toMatch();
      } catch (err) {
        await this.failed(err);
      } finally {
        this.saving = false;
      }
    },

    /**
     * PAR-30: quem saiu da lista sai da tela, o resto fica como estava (e quem entrou vai para Sem time). Com o
     * conflito, a tela volta aos times salvos por outra pessoa.
     */
    async failed(err: unknown) {
      const out = err instanceof ApiRequestError && err.code === 'MATCH_TEAM_PLAYER_OUT';
      if (!out && !isVersionConflict(err)) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return;
      }
      const players = out ? ((err.details as { players?: MatchTeamPlayerRef[] }).players ?? []) : [];
      const names = this.personsOf(players).map((p) => p.name);
      const match = await this.fetch();
      if (!match) return;
      this.match = match;
      if (out) {
        const kept = withoutPlayers(this.draft, players);
        const placed = new Set([...kept.teams.flat(), ...kept.unassigned].map(refKey));
        const arrived = match.in.map(refOf).filter((r) => !placed.has(refKey(r)));
        this.draft = { ...kept, unassigned: [...kept.unassigned, ...arrived] };
        this.$q.notify({
          type: 'warning',
          message: this.$t('matches.lineup.playerOut', { names: names.join(', ') }),
        });
        return;
      }
      this.draft = this.startFrom(match);
      this.initial = JSON.stringify(this.draft);
      this.$q.notify({ type: 'warning', message: this.$t('matches.lineup.conflict') });
    },

    toMatch() {
      this.$router.replace({ name: 'group-match', params: { id: this.group.id, matchId: this.matchId } });
    },

    back() {
      this.$router.push({ name: 'group-match', params: { id: this.group.id, matchId: this.matchId } });
    },
  },
});
</script>

<template>
  <div>
    <q-btn flat no-caps dense icon="chevron_left" :label="$t('matches.lineup.pageTitle')" class="back" @click="back" />

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!match" class="loading"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <div class="controls">
        <div class="count">
          <span class="sc-caption">{{ $t('matches.lineup.count') }}</span>
          <q-btn
            flat
            round
            dense
            icon="remove"
            :aria-label="$t('matches.lineup.fewer')"
            :disable="saving || draft.teams.length <= limits.min"
            @click="resize(-1)"
          />
          <span class="sc-number">{{ draft.teams.length }}</span>
          <q-btn
            flat
            round
            dense
            icon="add"
            :aria-label="$t('matches.lineup.more')"
            :disable="saving || draft.teams.length >= limits.max"
            @click="resize(1)"
          />
        </div>
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          icon="shuffle"
          :label="hasPlayers ? $t('matches.lineup.redraw') : $t('matches.lineup.draw')"
          :disable="saving"
          @click="draw"
        />
      </div>

      <section v-for="(team, t) in teams" :key="t">
        <h2 class="sc-section">{{ $t('matches.lineup.team', { n: t + 1 }) }} · {{ team.length }}</h2>
        <ul v-if="team.length > 0" class="sc-card list">
          <li v-for="p in team" :key="keyOf(p.ref)">
            <button type="button" class="row" :disabled="saving" @click="moving = p">
              <span class="name">{{ p.name }}</span>
              <q-badge v-if="p.reserve" color="grey" :label="$t('matches.reserve')" />
              <q-badge v-if="p.guest" color="grey" :label="$t('matches.lineup.guest')" />
              <q-icon name="swap_horiz" class="move" />
            </button>
          </li>
        </ul>
        <div v-else class="sc-caption empty">{{ $t('matches.lineup.empty') }}</div>
      </section>

      <section v-if="unassigned.length > 0">
        <h2 class="sc-section">{{ $t('matches.lineup.unassigned') }} · {{ unassigned.length }}</h2>
        <ul class="sc-card list">
          <li v-for="p in unassigned" :key="keyOf(p.ref)">
            <button type="button" class="row" :disabled="saving" @click="moving = p">
              <span class="name">{{ p.name }}</span>
              <q-badge v-if="p.reserve" color="grey" :label="$t('matches.reserve')" />
              <q-badge v-if="p.guest" color="grey" :label="$t('matches.lineup.guest')" />
              <q-icon name="swap_horiz" class="move" />
            </button>
          </li>
        </ul>
      </section>

      <div class="actions">
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="$t('matches.lineup.save')"
          :loading="saving"
          @click="save"
        />
      </div>

      <BottomSheet
        :model-value="moving !== undefined"
        :title="moving ? $t('matches.lineup.moveTitle', { name: moving.name }) : ''"
        @update:model-value="moving = undefined"
      >
        <q-list class="targets">
          <q-item v-for="(_, t) in draft.teams" :key="t" clickable :active="movingTeam === t" @click="move(t)">
            <q-item-section>{{ $t('matches.lineup.team', { n: t + 1 }) }}</q-item-section>
            <q-item-section v-if="movingTeam === t" side><q-icon name="check" /></q-item-section>
          </q-item>
          <q-item clickable :active="movingTeam === null" @click="move(null)">
            <q-item-section>{{ $t('matches.lineup.unassigned') }}</q-item-section>
            <q-item-section v-if="movingTeam === null" side><q-icon name="check" /></q-item-section>
          </q-item>
        </q-list>
      </BottomSheet>
    </template>
  </div>
</template>

<style scoped>
.back {
  margin-bottom: 8px;
}

.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.count {
  display: flex;
  align-items: center;
  gap: 4px;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.list li + li {
  border-top: 1px solid var(--sc-line);
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 16px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.name {
  flex: 1;
  font-weight: 600;
}

.move {
  opacity: 0.6;
}

.empty {
  padding: 8px 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin: 24px 0;
}

.targets {
  margin-top: 8px;
}

.error {
  padding: 24px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
