<script lang="ts">
import {
  type Group,
  MATCH_RESULT_LIMITS,
  MATCH_TEAMS_LIMITS,
  type Match,
  type MatchDayWinner,
  type MatchGameWinner,
  type MatchResultMode,
  type MatchTeamPlayerOut,
  type MatchTeamPlayerRef,
} from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { confirmAction } from '@scorely/web/src/lib/confirm';
import { ApiRequestError, isVersionConflict } from '@scorely/web/src/lib/http';
import {
  type DayDraft,
  dayDraftFrom,
  dayInput,
  draftStandings,
  type GameDraft,
  type GameSide,
  gameReady,
  gamesDraftFrom,
  gamesInput,
  hasContent,
  isKnownResultMember,
  listRefs,
  moveInGame,
  nextGame,
  resultMemberName,
  resultRefOf,
  sideOf,
  sortedStandings,
  startMode,
} from '@scorely/web/src/modules/groups/matches/match.result';
import {
  moveToTeam,
  refKey,
  refOf,
  resizeTeams,
  teamOf,
  withoutPlayers,
} from '@scorely/web/src/modules/groups/matches/match.teams';
import { matchesApi } from '@scorely/web/src/modules/groups/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

interface Person {
  ref: MatchTeamPlayerRef;
  name: string;
  guest: boolean;
}

/** O jogo aberto no painel: `index` ausente = Novo jogo. */
interface Editing {
  index?: number;
  game: GameDraft;
}

/**
 * PAR-39: a tela do resultado, aberta por Registrar (ou Corrigir) resultado. No topo, Pelo dia | Por jogo. Pelo dia:
 * os times, ajustados com tocar na pessoa, quem está De fora e Quem venceu?. Por jogo: os jogos numerados, Novo jogo
 * (que vem com os times do anterior) e a contagem enquanto se anota. Salvar grava o resultado inteiro (PAR-32).
 */
export default defineComponent({
  name: 'MatchResultPage',

  components: { BottomSheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      match: undefined as Match | undefined,
      mode: 'day' as MatchResultMode,
      day: { teams: [[], []], unassigned: [] } as DayDraft,
      games: [] as GameDraft[],
      /** O que abriu (ou ficou salvo): sem mudança, sair não pergunta. */
      initial: '',
      error: '',
      saving: false,
      /** Sair sem perguntar (salvou, ou a pessoa não pode registrar). */
      leaving: false,
      moving: undefined as Person | undefined,
      editing: undefined as Editing | undefined,
      teamLimits: MATCH_TEAMS_LIMITS,
      gameLimits: MATCH_RESULT_LIMITS.games,
    };
  },

  computed: {
    matchId(): string {
      return String(this.$route.params.matchId ?? '');
    },

    /** Quem pode estar no resultado: a lista, dentro e depois a fila (PAR-33), e o nome de cada um. */
    list(): MatchTeamPlayerRef[] {
      return this.match ? listRefs(this.match) : [];
    },

    /** Os nomes: da lista e, para quem só está no resultado registrado (saiu do grupo), do resultado. */
    people(): Map<string, Person> {
      const m = this.match;
      if (!m) return new Map();
      const fromList: Person[] = [...m.in, ...m.queue].map((e) => ({
        ref: refOf(e),
        name: e.kind === 'player' ? e.user.nickname : e.name,
        guest: e.kind === 'guest',
      }));
      const r = m.result;
      const members = r ? (r.mode === 'day' ? r.teams.flat() : r.games.flatMap((g) => g.teams.flat())) : [];
      const fromResult: Person[] = members.filter(isKnownResultMember).map((p) => ({
        ref: resultRefOf(p),
        name: resultMemberName(p),
        guest: p.kind === 'guest',
      }));
      return new Map([...fromResult, ...fromList].map((p) => [refKey(p.ref), p]));
    },

    dayTeams(): Person[][] {
      return this.day.teams.map((team) => this.personsOf(team));
    },

    dayOut(): Person[] {
      return this.personsOf(this.day.unassigned);
    },

    dayWinnerOptions(): { label: string; value: MatchDayWinner }[] {
      return [
        ...this.day.teams.map((_, t) => ({
          label: this.$t('matches.lineup.team', { n: t + 1 }),
          value: t + 1,
        })),
        { label: this.$t('matches.result.draw'), value: 'draw' as const },
      ];
    },

    gameWinnerOptions(): { label: string; value: MatchGameWinner }[] {
      return [
        { label: this.$t('matches.result.teamA'), value: 'a' },
        { label: this.$t('matches.result.teamB'), value: 'b' },
        { label: this.$t('matches.result.draw'), value: 'draw' },
      ];
    },

    sideOptions(): { label: string; value: GameSide | 'out' }[] {
      return [
        { label: 'A', value: 'a' },
        { label: 'B', value: 'b' },
        { label: this.$t('matches.result.out'), value: 'out' },
      ];
    },

    /** PAR-34, 39: a contagem enquanto se anota, antes de salvar. */
    standings() {
      const named = draftStandings(this.games).map((s) => ({ ...s, name: this.nameOf(s.member) }));
      return sortedStandings(named, (s) => s.name);
    },

    movingTeam(): number | null {
      return this.moving ? teamOf(this.day, this.moving.ref) : null;
    },

    snapshot(): string {
      return JSON.stringify({ mode: this.mode, day: this.day, games: this.games });
    },

    dirty(): boolean {
      return !!this.match && this.snapshot !== this.initial;
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
    void confirmAction({
      title: this.$t('matches.result.discardTitle'),
      message: this.$t('matches.result.discardMessage'),
      ok: this.$t('matches.lineup.discard'),
      cancel: this.$t('matches.lineup.stay'),
      danger: true,
    }).then((ok) => (ok ? next() : next(false)));
  },

  methods: {
    keyOf(ref: MatchTeamPlayerRef): string {
      return refKey(ref);
    },

    nameOf(ref: MatchTeamPlayerRef): string {
      return this.people.get(refKey(ref))?.name ?? this.$t('matches.lineup.someone');
    },

    personsOf(refs: readonly MatchTeamPlayerRef[]): Person[] {
      return refs.map((r) => this.people.get(refKey(r)) ?? { ref: r, name: this.nameOf(r), guest: false });
    },

    gameLabel(game: GameDraft): string {
      if (game.winner === undefined) return this.$t('matches.result.gameIncomplete');
      if (game.winner === 'draw') return this.$t('matches.result.draw');
      const team = this.$t(game.winner === 'a' ? 'matches.result.teamA' : 'matches.result.teamB');
      return `${team} ${this.$t('matches.result.winner')}`;
    },

    teamNames(refs: readonly MatchTeamPlayerRef[]): string {
      return refs.map((r) => this.nameOf(r)).join(', ') || this.$t('matches.lineup.empty');
    },

    standingText(s: { wins: number; draws: number; losses: number; played: number }): string {
      return [
        this.$t('matches.result.standingWins', { n: s.wins }),
        ...(s.draws > 0 ? [this.$t('matches.result.standingDraws', { n: s.draws })] : []),
        ...(s.losses > 0 ? [this.$t('matches.result.standingLosses', { n: s.losses })] : []),
      ]
        .join(' · ')
        .concat(' ', this.$t('matches.result.standingPlayed', s.played));
    },

    async fetch(): Promise<Match | undefined> {
      try {
        return await matchesApi.get(this.group.id, this.matchId);
      } catch (err) {
        this.error = errorMessage(err);
        return undefined;
      }
    },

    /** PAR-39: começa no jeito e no que está registrado; sem resultado, nos times salvos. */
    reset(match: Match) {
      this.match = match;
      this.mode = startMode(match);
      this.day = dayDraftFrom(match);
      this.games = gamesDraftFrom(match);
      this.initial = this.snapshot;
    },

    async load() {
      this.error = '';
      const match = await this.fetch();
      if (!match) return;
      if (!match.actions.recordResult) {
        this.leaving = true;
        this.toMatch();
        return;
      }
      this.reset(match);
    },

    /** PAR-39: trocar de jeito com algo preenchido pede confirmação. */
    async switchMode(next: MatchResultMode) {
      if (next === this.mode) return;
      if (!hasContent(this.mode, this.day, this.games)) {
        this.mode = next;
        return;
      }
      const confirmed = await confirmAction({
        title: this.$t('matches.result.switchTitle'),
        message: this.$t('matches.result.switchMessage'),
        ok: this.$t('matches.result.switch'),
        cancel: this.$t('matches.lineup.stay'),
      });
      if (!confirmed) return;
      this.mode = next;
    },

    resize(delta: number) {
      const count = this.day.teams.length + delta;
      if (count < this.teamLimits.min || count > this.teamLimits.max) return;
      const winner =
        typeof this.day.winner === 'number' && this.day.winner > count ? undefined : this.day.winner;
      this.day = { ...resizeTeams(this.day, count), ...(winner !== undefined && { winner }) };
    },

    move(target: number | null) {
      if (this.moving) this.day = { ...this.day, ...moveToTeam(this.day, this.moving.ref, target) };
      this.moving = undefined;
    },

    setDayWinner(winner: MatchDayWinner) {
      this.day = { ...this.day, winner };
    },

    newGame() {
      this.editing = { game: nextGame(this.games, this.match ?? {}) };
    },

    editGame(index: number) {
      const game = this.games[index];
      if (game) this.editing = { index, game: { ...game, a: [...game.a], b: [...game.b] } };
    },

    sideIn(ref: MatchTeamPlayerRef): GameSide | 'out' {
      return this.editing ? (sideOf(this.editing.game, ref) ?? 'out') : 'out';
    },

    setSide(ref: MatchTeamPlayerRef, side: GameSide | 'out') {
      if (!this.editing) return;
      this.editing = {
        ...this.editing,
        game: moveInGame(this.editing.game, ref, side === 'out' ? null : side),
      };
    },

    setGameWinner(winner: MatchGameWinner) {
      if (this.editing) this.editing = { ...this.editing, game: { ...this.editing.game, winner } };
    },

    /** Quem aparece no painel do jogo: a lista e, no jogo registrado, quem só está nele. */
    gamePeople(): Person[] {
      const game = this.editing?.game;
      const extra = game
        ? [...game.a, ...game.b].filter((r) => !this.list.some((l) => refKey(l) === refKey(r)))
        : [];
      return this.personsOf([...this.list, ...extra]);
    },

    saveGame() {
      const e = this.editing;
      if (!e) return;
      if (!gameReady(e.game)) {
        this.$q.notify({ type: 'warning', message: this.$t('matches.result.gameIncomplete') });
        return;
      }
      this.games =
        e.index === undefined
          ? [...this.games, e.game]
          : this.games.map((g, i) => (i === e.index ? e.game : g));
      this.editing = undefined;
    },

    /** PAR-39: apagar o jogo, com confirmação; os seguintes são renumerados. */
    async deleteGame() {
      const index = this.editing?.index;
      if (index === undefined) return;
      const confirmed = await confirmAction({
        title: this.$t('matches.result.deleteGameTitle', { n: index + 1 }),
        message: this.$t('matches.result.deleteGameMessage'),
        ok: this.$t('matches.result.deleteGame'),
        cancel: this.$t('matches.lineup.stay'),
        danger: true,
      });
      if (!confirmed) return;
      this.games = this.games.filter((_, i) => i !== index);
      this.editing = undefined;
    },

    async save() {
      if (!this.match) return;
      const version = this.match.result?.version ?? 0;
      const input = this.mode === 'day' ? dayInput(this.day, version) : gamesInput(this.games, version);
      if (!input) {
        const key = this.mode === 'day' ? 'matches.result.pickWinner' : 'matches.result.gameIncomplete';
        this.$q.notify({ type: 'warning', message: this.$t(key) });
        return;
      }
      this.saving = true;
      try {
        await matchesApi.saveResult(this.group.id, this.matchId, input);
        this.leaving = true;
        this.$q.notify({ type: 'positive', message: this.$t('matches.result.saved') });
        this.toMatch();
      } catch (err) {
        await this.failed(err);
      } finally {
        this.saving = false;
      }
    },

    /**
     * PAR-39, como na tela de dividir (PAR-30): quem saiu da lista sai da tela, o resto fica como estava. Com o
     * conflito, a tela volta ao resultado que outra pessoa salvou.
     */
    async failed(err: unknown) {
      const out = err instanceof ApiRequestError && err.code === 'MATCH_TEAM_PLAYER_OUT';
      if (!out && !isVersionConflict(err)) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return;
      }
      const players = out ? ((err.details as { players?: MatchTeamPlayerOut[] }).players ?? []) : [];
      const names = players.map((p) => p.name ?? this.$t('matches.lineup.someone'));
      const match = await this.fetch();
      if (!match) return;
      if (!out) {
        this.reset(match);
        this.$q.notify({ type: 'warning', message: this.$t('matches.result.conflict') });
        return;
      }
      this.match = match;
      const gone = new Set(players.map(refKey));
      const keep = (refs: readonly MatchTeamPlayerRef[]) => refs.filter((r) => !gone.has(refKey(r)));
      const kept = withoutPlayers(this.day, players);
      const placed = new Set([...kept.teams.flat(), ...kept.unassigned].map(refKey));
      this.day = {
        ...this.day,
        ...kept,
        unassigned: [...kept.unassigned, ...listRefs(match).filter((r) => !placed.has(refKey(r)))],
      };
      this.games = this.games.map((g) => ({ ...g, a: keep(g.a), b: keep(g.b) }));
      this.$q.notify({
        type: 'warning',
        message: this.$t('matches.lineup.playerOut', { names: names.join(', ') }),
      });
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
    <q-btn flat no-caps dense icon="chevron_left" :label="$t('matches.result.title')" class="back" @click="back" />

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!match" class="loading"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <q-btn-toggle
        :model-value="mode"
        spread
        no-caps
        unelevated
        toggle-color="primary"
        class="modes"
        :options="[
          { label: $t('matches.result.modeDay'), value: 'day' },
          { label: $t('matches.result.modeGames'), value: 'games' },
        ]"
        :disable="saving"
        @update:model-value="switchMode"
      />

      <template v-if="mode === 'day'">
        <div class="controls">
          <span class="sc-caption">{{ $t('matches.lineup.count') }}</span>
          <q-btn
            flat
            round
            dense
            icon="remove"
            :aria-label="$t('matches.lineup.fewer')"
            :disable="saving || day.teams.length <= teamLimits.min"
            @click="resize(-1)"
          />
          <span class="sc-number">{{ day.teams.length }}</span>
          <q-btn
            flat
            round
            dense
            icon="add"
            :aria-label="$t('matches.lineup.more')"
            :disable="saving || day.teams.length >= teamLimits.max"
            @click="resize(1)"
          />
        </div>

        <section v-for="(team, t) in dayTeams" :key="t">
          <h2 class="sc-section">{{ $t('matches.lineup.team', { n: t + 1 }) }} · {{ team.length }}</h2>
          <ul v-if="team.length > 0" class="sc-card list">
            <li v-for="p in team" :key="keyOf(p.ref)">
              <button type="button" class="row" :disabled="saving" @click="moving = p">
                <span class="name">{{ p.name }}</span>
                <q-badge v-if="p.guest" color="grey" :label="$t('matches.lineup.guest')" />
                <q-icon name="swap_horiz" class="move" />
              </button>
            </li>
          </ul>
          <div v-else class="sc-caption empty">{{ $t('matches.lineup.empty') }}</div>
        </section>

        <section v-if="dayOut.length > 0">
          <h2 class="sc-section">{{ $t('matches.result.out') }} · {{ dayOut.length }}</h2>
          <ul class="sc-card list">
            <li v-for="p in dayOut" :key="keyOf(p.ref)">
              <button type="button" class="row" :disabled="saving" @click="moving = p">
                <span class="name">{{ p.name }}</span>
                <q-badge v-if="p.guest" color="grey" :label="$t('matches.lineup.guest')" />
                <q-icon name="swap_horiz" class="move" />
              </button>
            </li>
          </ul>
        </section>

        <section>
          <h2 class="sc-section">{{ $t('matches.result.whoWon') }}</h2>
          <div class="choices">
            <q-btn
              v-for="o in dayWinnerOptions"
              :key="String(o.value)"
              no-caps
              :unelevated="day.winner === o.value"
              :outline="day.winner !== o.value"
              color="primary"
              :label="o.label"
              :disable="saving"
              @click="setDayWinner(o.value)"
            />
          </div>
        </section>
      </template>

      <template v-else>
        <section>
          <h2 class="sc-section">{{ $t('matches.result.games') }}</h2>
          <ul v-if="games.length > 0" class="sc-card list">
            <li v-for="(g, n) in games" :key="n">
              <button type="button" class="row" :disabled="saving" @click="editGame(n)">
                <span class="name">{{ $t('matches.result.game', { n: n + 1 }) }}</span>
                <span class="sc-caption grow">{{ gameLabel(g) }}</span>
                <q-icon name="edit" class="move" />
              </button>
            </li>
          </ul>
          <div v-else class="sc-caption empty">{{ $t('matches.result.noGames') }}</div>
          <q-btn
            flat
            no-caps
            class="sc-btn-outline new-game"
            icon="add"
            :label="$t('matches.result.newGame')"
            :disable="saving || games.length >= gameLimits.max"
            @click="newGame"
          />
        </section>

        <section v-if="standings.length > 0">
          <h2 class="sc-section">{{ $t('matches.result.standings') }}</h2>
          <ol class="sc-card list">
            <li v-for="(s, i) in standings" :key="keyOf(s.member)" class="row static">
              <span class="sc-number pos">{{ i + 1 }}</span>
              <span class="name">{{ s.name }}</span>
              <span class="sc-caption">{{ standingText(s) }}</span>
            </li>
          </ol>
        </section>
      </template>

      <div class="actions">
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="$t('matches.result.save')"
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
          <q-item v-for="(_, t) in day.teams" :key="t" clickable :active="movingTeam === t" @click="move(t)">
            <q-item-section>{{ $t('matches.lineup.team', { n: t + 1 }) }}</q-item-section>
            <q-item-section v-if="movingTeam === t" side><q-icon name="check" /></q-item-section>
          </q-item>
          <q-item clickable :active="movingTeam === null" @click="move(null)">
            <q-item-section>{{ $t('matches.result.out') }}</q-item-section>
            <q-item-section v-if="movingTeam === null" side><q-icon name="check" /></q-item-section>
          </q-item>
        </q-list>
      </BottomSheet>

      <BottomSheet
        :model-value="editing !== undefined"
        :title="
          editing
            ? $t('matches.result.game', { n: (editing.index ?? games.length) + 1 })
            : ''
        "
        @update:model-value="editing = undefined"
      >
        <template v-if="editing">
          <div class="sc-caption versus">
            {{ $t('matches.result.versus', { a: teamNames(editing.game.a), b: teamNames(editing.game.b) }) }}
          </div>
          <ul class="list sheet-list">
            <li v-for="p in gamePeople()" :key="keyOf(p.ref)" class="row static">
              <span class="name">{{ p.name }}</span>
              <q-btn-toggle
                :model-value="sideIn(p.ref)"
                dense
                no-caps
                unelevated
                toggle-color="primary"
                :options="sideOptions"
                @update:model-value="setSide(p.ref, $event)"
              />
            </li>
          </ul>
          <h3 class="sc-section">{{ $t('matches.result.whoWon') }}</h3>
          <div class="choices">
            <q-btn
              v-for="o in gameWinnerOptions"
              :key="o.value"
              no-caps
              :unelevated="editing.game.winner === o.value"
              :outline="editing.game.winner !== o.value"
              color="primary"
              :label="o.label"
              @click="setGameWinner(o.value)"
            />
          </div>
          <div class="actions sheet-actions">
            <q-btn
              v-if="editing.index !== undefined"
              flat
              no-caps
              color="negative"
              :label="$t('matches.result.deleteGame')"
              @click="deleteGame"
            />
            <span class="grow" />
            <q-btn flat no-caps :label="$t('matches.form.cancel')" @click="editing = undefined" />
            <q-btn color="primary" unelevated no-caps class="sc-btn-main" :label="$t('matches.form.save')" @click="saveGame" />
          </div>
        </template>
      </BottomSheet>
    </template>
  </div>
</template>

<style scoped>
.back {
  margin-bottom: 8px;
}

.modes {
  margin-bottom: 16px;
}

.controls {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
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

.row.static {
  cursor: default;
}

.sheet-list .row {
  padding: 8px 0;
}

.pos {
  width: 24px;
  text-align: right;
}

.name {
  flex: 1;
  font-weight: 600;
}

.grow {
  flex: 1;
}

.move {
  opacity: 0.6;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.new-game {
  margin-top: 8px;
}

.versus {
  margin: 8px 0;
}

.empty {
  padding: 8px 0;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 24px 0;
}

.sheet-actions {
  margin: 16px 0 0;
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
