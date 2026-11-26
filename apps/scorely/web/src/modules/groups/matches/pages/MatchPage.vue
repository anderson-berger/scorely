<script lang="ts">
import type {
  AdvanceMatchWave,
  AttendanceStatus,
  CompetitionRef,
  Group,
  Match,
  MatchEntry,
  MatchGuestRequest,
  MatchResult,
  MatchResultMember,
  MatchSeries,
  MatchStanding,
  MatchTeamMember,
  MatchWave,
} from '@scorely/contracts';
import SettingsRow from '@scorely/web/src/components/SettingsRow.vue';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { confirmAction } from '@scorely/web/src/lib/confirm';
import { currentTimeZone, formatDateTime } from '@scorely/web/src/lib/datetime';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { competitionName } from '@scorely/web/src/modules/groups/competitions/competition.display';
import { canShare } from '@scorely/web/src/modules/groups/invite-link';
import MatchCompetitionsSheet from '@scorely/web/src/modules/groups/matches/components/MatchCompetitionsSheet.vue';
import MatchGuestSheet from '@scorely/web/src/modules/groups/matches/components/MatchGuestSheet.vue';
import MatchSeriesSheet from '@scorely/web/src/modules/groups/matches/components/MatchSeriesSheet.vue';
import MatchSettingSheet, {
  type MatchSettingSection,
} from '@scorely/web/src/modules/groups/matches/components/MatchSettingSheet.vue';
import MatchWhenSheet from '@scorely/web/src/modules/groups/matches/components/MatchWhenSheet.vue';
import { matchMessage, teamsMessage } from '@scorely/web/src/modules/groups/matches/match.message';
import {
  resultHeadline,
  resultMemberName,
  sortedStandings,
} from '@scorely/web/src/modules/groups/matches/match.result';
import { durationLabel, durationOf, slotsOf } from '@scorely/web/src/modules/groups/matches/match.settings';
import {
  formatSummary,
  openingSummary,
  seriesSummary,
} from '@scorely/web/src/modules/groups/matches/match.summary';
import { matchesApi } from '@scorely/web/src/modules/groups/matches/matches.api';
import { copyToClipboard } from 'quasar';
import { defineComponent, type PropType } from 'vue';

const WAVES: readonly MatchWave[] = ['members', 'reserves', 'guests'];

/**
 * PAR-18: a página da partida, o link do WhatsApp. O dia, a hora, o recado e a onda numa linha; Vou e Não vou;
 * as listas; e, para quem tem `matches.manage`, os pedidos de convidado, abrir a próxima onda, as configurações da
 * partida (PAR-06) e cancelar.
 * PAR-19: Copiar para o WhatsApp.
 * PAR-38: a partir do início, a seção Resultado, antes dos Times, com o Vale para (PAR-40); PAR-39: Registrar (ou
 * Corrigir) resultado.
 */
export default defineComponent({
  name: 'MatchPage',

  components: {
    MatchCompetitionsSheet,
    MatchGuestSheet,
    MatchSeriesSheet,
    MatchSettingSheet,
    MatchWhenSheet,
    SettingsRow,
    StatusChip,
  },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      match: undefined as Match | undefined,
      error: '',
      busy: false,
      whenOpen: false,
      settingOpen: false,
      section: 'format' as MatchSettingSection,
      guestOpen: false,
      seriesOpen: false,
      competitionsOpen: false,
    };
  },

  computed: {
    matchId(): string {
      return String(this.$route.params.matchId ?? '');
    },

    /** PAR-02: sem formato, `undefined` (sem limite). */
    slots(): number | undefined {
      return this.match ? slotsOf(this.match) : undefined;
    },

    /** PAR-03: nenhuma hora da abertura configurada. */
    unconfigured(): boolean {
      const m = this.match;
      return (
        !!m && m.membersHours === undefined && m.reservesHours === undefined && m.guestsHours === undefined
      );
    },

    /** "Confirmados (10 de 12)", ou "Confirmados (10)" sem formato (PAR-18). */
    inTitle(): string {
      const count = this.match?.in.length ?? 0;
      return this.slots === undefined
        ? this.$t('matches.lists.inOpen', { count })
        : this.$t('matches.lists.in', { count, slots: this.slots });
    },

    answer(): AttendanceStatus | undefined {
      const mine = this.match?.myAttendance;
      if (mine === 'in' || mine === 'queued') return 'going';
      return mine === 'not_going' ? 'not_going' : undefined;
    },

    /** "Lista aberta para membros · reservas a partir de qui, 19:00", ou "Lista aberta" sem configuração (PAR-18). */
    waveLine(): string {
      const m = this.match;
      if (!m) return '';
      // PAR-18: passada a hora marcada sem iniciar, a partida espera.
      if (m.status === 'closed' && Date.parse(m.startsAt) <= Date.now())
        return this.$t('matches.status.awaiting');
      if (m.status !== 'open' && m.status !== 'scheduled') return this.$t(`matches.status.${m.status}`);
      if (this.unconfigured) {
        return m.closeHours > 0
          ? `${this.$t('matches.openToAll')} · ${this.$t('matches.next.close', { at: this.short(m.waves.close) })}`
          : this.$t('matches.openToAll');
      }
      const head = m.wave ? this.$t(`matches.wave.${m.wave}`) : this.$t('matches.status.scheduled');
      const nextWave = WAVES[m.wave ? WAVES.indexOf(m.wave) + 1 : 0];
      const nextAt = nextWave ? m.waves[nextWave] : undefined;
      const tail =
        nextWave && nextAt
          ? this.$t(`matches.next.${nextWave}`, { at: this.short(nextAt) })
          : m.closeHours > 0
            ? this.$t('matches.next.close', { at: this.short(m.waves.close) })
            : '';
      return tail ? `${head} · ${tail}` : head;
    },

    /** PAR-05: as ondas que dá para abrir agora, na ordem. */
    advanceable(): AdvanceMatchWave[] {
      const m = this.match;
      if (!m?.actions.manage || m.status === 'closed') return [];
      const current = m.wave ? WAVES.indexOf(m.wave) : -1;
      return (['reserves', 'guests'] as const).filter((w) => WAVES.indexOf(w) > current);
    },

    /** PAR-38: a seção Resultado aparece a partir do início, menos na cancelada. */
    showResult(): boolean {
      const status = this.match?.status;
      return status === 'in_progress' || status === 'finished';
    },

    /** PAR-38: quem venceu, numa linha. */
    headline(): string {
      const r = this.match?.result;
      if (!r) return '';
      return resultHeadline(r.mode === 'day' ? { mode: 'day', winner: r.winner } : r);
    },

    /** PAR-38: "Você venceu" para quem venceu o dia. */
    iWon(): boolean {
      const me = this.auth.user?.id;
      return !!this.match?.result?.dayWinners.some((p) => p.kind === 'player' && p.user.id === me);
    },

    /** PAR-38: a contagem, de quem mais venceu para quem menos venceu; no empate, pelo apelido. */
    standings(): MatchStanding[] {
      const r = this.match?.result;
      return r?.mode === 'games' ? sortedStandings(r.standings, (x) => resultMemberName(x.member)) : [];
    },

    shareable(): boolean {
      return canShare();
    },

    /** PAR-18: o bloco das ações de quem organiza aparece quando há alguma. */
    organize(): boolean {
      const a = this.match?.actions;
      if (!a) return false;
      return (
        a.start || a.finish || a.unstart || a.manageTeams || a.recordResult || this.advanceable.length > 0
      );
    },

    /** PAR-18: o time de quem vê ("Seu time"), ou -1. */
    myTeam(): number {
      const me = this.auth.user?.id;
      return (
        this.match?.lineup?.list.findIndex((team) =>
          team.some((p) => p.kind === 'player' && p.user.id === me),
        ) ?? -1
      );
    },
  },

  watch: {
    matchId() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    when(iso: string): string {
      return this.$t('matches.when', {
        weekday: this.weekday(iso),
        day: formatDateTime(iso, 'dayMonth'),
        time: formatDateTime(iso, 'time'),
      });
    },

    short(iso: string): string {
      return this.$t('matches.at', { weekday: this.weekday(iso), time: formatDateTime(iso, 'time') });
    },

    weekday(iso: string): string {
      return formatDateTime(iso, 'weekdayShort').replace(/\.$/, '');
    },

    entryKey(entry: MatchEntry): string {
      return entry.kind === 'player' ? entry.user.id : entry.guestId;
    },

    entryName(entry: MatchEntry): string {
      return entry.kind === 'player' ? entry.user.nickname : entry.name;
    },

    async load() {
      if (!this.matchId) return;
      this.error = '';
      try {
        this.match = await matchesApi.get(this.group.id, this.matchId);
      } catch (err) {
        this.match = undefined;
        this.error = errorMessage(err);
      }
    },

    /** Toda ação responde a partida inteira; o erro aparece e a tela relê. */
    async run(action: () => Promise<Match>) {
      this.busy = true;
      try {
        this.match = await action();
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        await this.load();
      } finally {
        this.busy = false;
      }
    },

    respond(status: AttendanceStatus) {
      if (this.answer === status) return;
      this.run(() => matchesApi.setAttendance(this.group.id, this.matchId, { status }));
    },

    advance(wave: AdvanceMatchWave) {
      this.run(() => matchesApi.advance(this.group.id, this.matchId, { wave }));
    },

    approve(r: MatchGuestRequest) {
      this.run(() => matchesApi.approveGuest(this.group.id, this.matchId, r.id));
    },

    decline(r: MatchGuestRequest) {
      this.run(() => matchesApi.declineGuest(this.group.id, this.matchId, r.id));
    },

    withdraw(r: MatchGuestRequest) {
      this.run(() => matchesApi.removeGuest(this.group.id, this.matchId, r.id));
    },

    async confirmRemoveGuest(entry: MatchEntry) {
      if (entry.kind !== 'guest') return;
      const confirmed = await confirmAction({
        title: this.$t('matches.removeGuestConfirm', { name: entry.name }),
        ok: this.$t('matches.removeGuest', { name: entry.name }),
        cancel: this.$t('matches.keep'),
        danger: true,
      });
      if (!confirmed) return;
      await this.run(() => matchesApi.removeGuest(this.group.id, this.matchId, entry.guestId));
    },

    async confirmCancel() {
      const confirmed = await confirmAction({
        title: this.$t('matches.cancelTitle'),
        message: this.$t('matches.cancelConfirm'),
        ok: this.$t('matches.cancelMatch'),
        cancel: this.$t('matches.keep'),
        danger: true,
      });
      if (!confirmed) return;
      await this.run(() => matchesApi.cancel(this.group.id, this.matchId));
      this.$q.notify({ type: 'positive', message: this.$t('matches.cancelled') });
    },

    /** PAR-41: iniciar à mão, a qualquer hora. */
    async confirmStart() {
      const confirmed = await confirmAction({
        title: this.$t('matches.startTitle'),
        message: this.$t('matches.startConfirm'),
        ok: this.$t('matches.start'),
        cancel: this.$t('matches.keep'),
      });
      if (!confirmed) return;
      await this.run(() => matchesApi.start(this.group.id, this.matchId));
    },

    /** PAR-42: voltar para a lista, antes de finalizar e sem resultado. */
    async confirmUnstart() {
      const confirmed = await confirmAction({
        title: this.$t('matches.unstartTitle'),
        message: this.$t('matches.unstartConfirm'),
        ok: this.$t('matches.unstart'),
        cancel: this.$t('matches.keep'),
      });
      if (!confirmed) return;
      await this.run(() => matchesApi.unstart(this.group.id, this.matchId));
    },

    /** PAR-43: finalizar não se desfaz; numa repetição, a da semana seguinte já é criada. */
    async confirmFinish() {
      const series = this.match?.series?.endedAt === undefined && this.match?.series !== undefined;
      const confirmed = await confirmAction({
        title: this.$t('matches.finishTitle'),
        message: series
          ? `${this.$t('matches.finishConfirm')} ${this.$t('matches.finishSeries')}`
          : this.$t('matches.finishConfirm'),
        ok: this.$t('matches.finish'),
        cancel: this.$t('matches.keep'),
        danger: true,
      });
      if (!confirmed) return;
      await this.run(() => matchesApi.finish(this.group.id, this.matchId));
    },

    /** PAR-18: o resumo de cada linha das configurações. */
    summaryOf(section: MatchSettingSection | 'when' | 'series' | 'competitions'): string {
      const m = this.match;
      if (!m) return '';
      if (section === 'when') {
        return this.$t('matches.settings.whenSummary', {
          when: this.short(m.startsAt),
          day: formatDateTime(m.startsAt, 'dayMonth'),
          duration: durationLabel(durationOf(m)),
        });
      }
      if (section === 'series') return m.series ? seriesSummary(m.series) : '';
      if (section === 'competitions') {
        return m.competitions.length > 0
          ? m.competitions.map((c) => competitionName(c)).join(', ')
          : this.$t('competitions.match.none');
      }
      if (section === 'result') {
        return this.$t(m.resultMode === 'day' ? 'matches.result.modeDay' : 'matches.result.modeGames');
      }
      return section === 'format' ? formatSummary(m) : openingSummary(m);
    },

    openSetting(section: MatchSettingSection) {
      this.section = section;
      this.settingOpen = true;
    },

    edited(match: Match) {
      this.match = match;
      this.whenOpen = false;
      this.settingOpen = false;
      this.competitionsOpen = false;
    },

    /** PAR-23: encerrada, a partida mostra a repetição com a data de encerramento. */
    seriesEnded(series: MatchSeries) {
      if (this.match) this.match = { ...this.match, series };
      this.seriesOpen = false;
    },

    guestSaved(match: Match) {
      this.match = match;
      this.guestOpen = false;
    },

    /** PAR-19: a mensagem no fuso de quem copia, com o link desta página. */
    message(): string {
      if (!this.match) return '';
      const link = `${window.location.origin}${this.$route.path}`;
      return matchMessage(this.match, { groupName: this.group.name, link, timeZone: currentTimeZone() });
    },

    async copy() {
      await copyToClipboard(this.message());
      this.$q.notify({ type: 'positive', message: this.$t('matches.copied') });
    },

    async share() {
      try {
        await navigator.share({ text: this.message() });
      } catch {
        // a pessoa fechou o compartilhar: nada a fazer
      }
    },

    memberKey(member: MatchTeamMember, index: number): string {
      if (member.kind === 'gone') return `gone:${index}`;
      return member.kind === 'player' ? member.user.id : member.guestId;
    },

    /** PAR-28: quem não tem mais perfil aparece como "Pessoa removida". */
    memberName(member: MatchTeamMember): string {
      if (member.kind === 'gone') return this.$t('matches.lineup.removed');
      return member.kind === 'player' ? member.user.nickname : member.name;
    },

    /** PAR-19: a mensagem dos times, sem quem saiu da lista. */
    teamsText(): string {
      if (!this.match) return '';
      const link = `${window.location.origin}${this.$route.path}`;
      return teamsMessage(this.match, { groupName: this.group.name, link, timeZone: currentTimeZone() });
    },

    async copyTeams() {
      await copyToClipboard(this.teamsText());
      this.$q.notify({ type: 'positive', message: this.$t('matches.lineup.copied') });
    },

    async shareTeams() {
      try {
        await navigator.share({ text: this.teamsText() });
      } catch {
        // a pessoa fechou o compartilhar: nada a fazer
      }
    },

    resultName(member: MatchResultMember): string {
      return resultMemberName(member);
    },

    resultKey(member: MatchResultMember, index: number): string {
      if (member.kind === 'gone') return `gone:${index}`;
      return member.kind === 'player' ? member.user.id : member.guestId;
    },

    /** PAR-38: "4 V · 1 D em 5 jogos" (os empates e as derrotas só quando há). */
    standingText(x: MatchStanding): string {
      return [
        this.$t('matches.result.standingWins', { n: x.wins }),
        ...(x.draws > 0 ? [this.$t('matches.result.standingDraws', { n: x.draws })] : []),
        ...(x.losses > 0 ? [this.$t('matches.result.standingLosses', { n: x.losses })] : []),
      ]
        .join(' · ')
        .concat(' ', this.$t('matches.result.standingPlayed', x.played));
    },

    /** PAR-38: quem venceu o jogo, no cabeçalho fechado. */
    gameWinner(winner: 'a' | 'b' | 'draw'): string {
      if (winner === 'draw') return this.$t('matches.result.draw');
      const team = this.$t(winner === 'a' ? 'matches.result.teamA' : 'matches.result.teamB');
      return `${team} ${this.$t('matches.result.winner')}`;
    },

    gamesOf(result: MatchResult) {
      return result.mode === 'games' ? result.games : [];
    },

    /** PAR-38, 40: "Vale para Temporada 2027.1". */
    competitionNameOf(c: CompetitionRef): string {
      return competitionName(c);
    },

    competitionsLine(): string {
      const list = this.match?.competitions ?? [];
      return list.length > 0
        ? this.$t('competitions.match.line', { names: list.map((c) => competitionName(c)).join(', ') })
        : this.$t('competitions.match.notCounting');
    },

    openCompetition(id: string) {
      this.$router.push({ name: 'group-competition', params: { id: this.group.id, competitionId: id } });
    },

    /** PAR-39: a tela do resultado. */
    recordResult() {
      this.$router.push({ name: 'group-match-result', params: { id: this.group.id, matchId: this.matchId } });
    },

    /** PAR-30: a tela de dividir. */
    splitTeams() {
      this.$router.push({ name: 'group-match-teams', params: { id: this.group.id, matchId: this.matchId } });
    },

    back() {
      this.$router.replace({ name: 'group-matches', params: { id: this.group.id } });
    },
  },
});
</script>

<template>
  <div class="match">
    <q-btn flat no-caps dense icon="chevron_left" :label="$t('matches.back')" class="back" @click="back" />

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!match" class="loading"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <header class="head">
        <div class="title-row">
          <h1 class="sc-display title">{{ when(match.startsAt) }}</h1>
          <StatusChip v-if="match.status === 'cancelled'" tone="danger">{{ $t('matches.status.cancelled') }}</StatusChip>
        </div>
        <div class="sc-caption wave">{{ waveLine }}</div>
      </header>

      <div v-if="!['cancelled', 'in_progress', 'finished'].includes(match.status)" class="answer">
        <div class="choice">
          <q-btn
            :unelevated="answer === 'going'"
            :outline="answer !== 'going'"
            color="primary"
            no-caps
            icon="check"
            :label="$t('matches.going')"
            :disable="busy || (answer !== 'going' && !match.actions.going)"
            :aria-pressed="answer === 'going'"
            @click="respond('going')"
          />
          <q-btn
            :unelevated="answer === 'not_going'"
            :outline="answer !== 'not_going'"
            color="negative"
            no-caps
            icon="close"
            :label="$t('matches.notGoing')"
            :disable="busy || (answer !== 'not_going' && !match.actions.notGoing)"
            :aria-pressed="answer === 'not_going'"
            @click="respond('not_going')"
          />
        </div>
        <q-btn
          v-if="match.actions.requestGuest"
          flat
          no-caps
          :class="{ 'sc-btn-outline': !$q.screen.xs }"
          icon="person_add"
          :label="$t('matches.bringGuest')"
          :disable="busy"
          @click="guestOpen = true"
        />
      </div>

      <div v-if="organize" class="organize">
        <q-btn
          v-if="match.actions.start"
          class="sc-btn-main"
          :class="{ 'full-width': $q.screen.xs }"
          unelevated
          no-caps
          color="primary"
          icon="play_arrow"
          :label="$t('matches.start')"
          :disable="busy"
          @click="confirmStart"
        />
        <q-btn
          v-if="match.actions.finish"
          class="sc-btn-main"
          :class="{ 'full-width': $q.screen.xs }"
          unelevated
          no-caps
          color="primary"
          icon="flag"
          :label="$t('matches.finish')"
          :disable="busy"
          @click="confirmFinish"
        />
        <q-btn
          v-if="match.actions.manageTeams"
          flat
          no-caps
          class="sc-btn-outline"
          icon="groups"
          :label="match.lineup ? $t('matches.lineup.change') : $t('matches.lineup.split')"
          :disable="busy"
          @click="splitTeams"
        />
        <q-btn
          v-if="match.actions.recordResult"
          flat
          no-caps
          class="sc-btn-outline"
          icon="emoji_events"
          :label="match.result ? $t('matches.result.fix') : $t('matches.result.record')"
          :disable="busy"
          @click="recordResult"
        />
        <template v-if="match.actions.manage">
          <q-btn
            v-for="w in advanceable"
            :key="w"
            flat
            no-caps
            class="sc-btn-outline"
            :label="$t(`matches.advance.${w}`)"
            :disable="busy"
            @click="advance(w)"
          />
        </template>
        <q-btn
          v-if="match.actions.unstart"
          flat
          no-caps
          class="sc-btn-outline"
          icon="undo"
          :label="$t('matches.unstart')"
          :disable="busy"
          @click="confirmUnstart"
        />
      </div>

      <section v-if="showResult" class="lineup">
        <h2 class="sc-section">{{ $t('matches.result.title') }}</h2>
        <div v-if="match.competitions.length > 0 || match.actions.manageCompetitions" class="counts">
          <span class="sc-caption grow">
            <template v-if="match.competitions.length === 0">{{ competitionsLine() }}</template>
            <template v-else>
              {{ $t('competitions.match.title') }}
              <a v-for="(c, i) in match.competitions" :key="c.id" href="#" class="link" @click.prevent="openCompetition(c.id)"
                >{{ i > 0 ? ', ' : '' }}{{ competitionNameOf(c) }}</a
              >
            </template>
          </span>
          <q-btn
            v-if="match.actions.manageCompetitions"
            flat
            no-caps
            dense
            :label="$t('competitions.match.change')"
            @click="competitionsOpen = true"
          />
        </div>
        <div v-if="!match.result" class="sc-caption empty">{{ $t('matches.result.none') }}</div>
        <template v-else>
          <div class="sc-card headline">
            <q-icon name="emoji_events" size="sm" color="primary" />
            <span class="name grow">{{ headline }}</span>
            <q-badge v-if="iWon" color="primary" :label="$t('matches.result.youWon')" />
          </div>

          <template v-if="match.result.mode === 'day'">
            <div
              v-for="(team, t) in match.result.teams"
              :key="t"
              class="sc-card team"
              :class="{ mine: match.result.winner === t + 1 }"
            >
              <div class="team-head">
                <span class="name">{{ $t('matches.lineup.team', { n: t + 1 }) }}</span>
                <span class="sc-caption">{{ team.length }}</span>
                <q-icon v-if="match.result.winner === t + 1" name="emoji_events" color="primary" />
              </div>
              <ol v-if="team.length > 0" class="list">
                <li v-for="(p, i) in team" :key="resultKey(p, i)" class="row">
                  <span class="sc-number pos">{{ i + 1 }}</span>
                  <span class="name">{{ resultName(p) }}</span>
                  <q-badge v-if="p.kind === 'guest'" color="grey" :label="$t('matches.lineup.guest')" />
                </li>
              </ol>
              <div v-else class="sc-caption team-empty">{{ $t('matches.lineup.empty') }}</div>
            </div>
          </template>

          <template v-else>
            <ol class="sc-card list">
              <li v-for="(x, i) in standings" :key="resultKey(x.member, i)" class="row">
                <span class="sc-number pos">{{ i + 1 }}</span>
                <span class="name grow">{{ resultName(x.member) }}</span>
                <span class="sc-caption">{{ standingText(x) }}</span>
              </li>
            </ol>
            <q-list class="sc-card games">
              <q-expansion-item
                v-for="(g, n) in gamesOf(match.result)"
                :key="n"
                dense
                :label="$t('matches.result.game', { n: n + 1 })"
                :caption="gameWinner(g.winner)"
              >
                <div class="game">
                  <div v-for="(side, s) in g.teams" :key="s" class="side" :class="{ won: g.winner === (s === 0 ? 'a' : 'b') }">
                    <div class="sc-caption">{{ $t(s === 0 ? 'matches.result.teamA' : 'matches.result.teamB') }}</div>
                    <div v-for="(p, i) in side" :key="resultKey(p, i)" class="name">{{ resultName(p) }}</div>
                  </div>
                </div>
              </q-expansion-item>
            </q-list>
          </template>
        </template>
      </section>

      <section v-if="match.lineup" class="lineup">
        <h2 class="sc-section">{{ $t('matches.lineup.title') }}</h2>
        <div v-for="(team, t) in match.lineup.list" :key="t" class="sc-card team" :class="{ mine: myTeam === t }">
          <div class="team-head">
            <span class="name">{{ $t('matches.lineup.team', { n: t + 1 }) }}</span>
            <span class="sc-caption">{{ team.filter((m) => !m.left).length }}</span>
            <q-badge v-if="myTeam === t" color="primary" :label="$t('matches.lineup.mine')" />
          </div>
          <ol v-if="team.length > 0" class="list">
            <li v-for="(p, i) in team" :key="memberKey(p, i)" class="row" :class="{ gone: p.left }">
              <span class="sc-number pos">{{ i + 1 }}</span>
              <span class="name">{{ memberName(p) }}</span>
              <q-badge v-if="p.kind === 'player' && p.tier === 'reserve'" color="grey" :label="$t('matches.reserve')" />
              <q-badge v-if="p.kind === 'guest'" color="grey" :label="$t('matches.lineup.guest')" />
              <span v-if="p.left" class="sc-caption">{{ $t('matches.lineup.left') }}</span>
            </li>
          </ol>
          <div v-else class="sc-caption team-empty">{{ $t('matches.lineup.empty') }}</div>
        </div>
        <div v-if="match.lineup.unassigned.length > 0" class="sc-card team">
          <div class="team-head">
            <span class="name">{{ $t('matches.lineup.unassigned') }}</span>
            <span class="sc-caption">{{ match.lineup.unassigned.length }}</span>
          </div>
          <ol class="list">
            <li v-for="(e, i) in match.lineup.unassigned" :key="entryKey(e)" class="row">
              <span class="sc-number pos">{{ i + 1 }}</span>
              <span class="name">{{ entryName(e) }}</span>
            </li>
          </ol>
        </div>
      </section>

      <section>
        <h2 class="sc-section">{{ inTitle }}</h2>
        <ol v-if="match.in.length > 0" class="sc-card list">
          <li v-for="(e, i) in match.in" :key="entryKey(e)" class="row">
            <span class="sc-number pos">{{ i + 1 }}</span>
            <span class="name">{{ entryName(e) }}</span>
            <q-badge v-if="e.kind === 'player' && e.tier === 'reserve'" color="grey" :label="$t('matches.reserve')" />
            <span v-if="e.kind === 'guest'" class="sc-caption">{{ $t('matches.guestOf', { name: e.requestedBy.nickname }) }}</span>
            <q-btn
              v-if="e.kind === 'guest' && e.removable"
              flat
              dense
              round
              icon="close"
              :aria-label="$t('matches.removeGuest', { name: e.name })"
              @click="confirmRemoveGuest(e)"
            />
          </li>
        </ol>
        <div v-else class="sc-caption empty">{{ $t('matches.lists.empty') }}</div>
      </section>

      <section v-if="match.queue.length > 0">
        <h2 class="sc-section">{{ $t('matches.lists.queue') }}</h2>
        <ol class="sc-card list">
          <li v-for="(e, i) in match.queue" :key="entryKey(e)" class="row">
            <span class="sc-number pos">{{ i + 1 }}</span>
            <span class="name">{{ entryName(e) }}</span>
            <q-badge v-if="e.kind === 'player' && e.tier === 'reserve'" color="grey" :label="$t('matches.reserve')" />
            <span v-if="e.kind === 'guest'" class="sc-caption">{{ $t('matches.guestOf', { name: e.requestedBy.nickname }) }}</span>
            <q-btn
              v-if="e.kind === 'guest' && e.removable"
              flat
              dense
              round
              icon="close"
              :aria-label="$t('matches.removeGuest', { name: e.name })"
              @click="confirmRemoveGuest(e)"
            />
          </li>
        </ol>
      </section>

      <section v-if="match.notGoing.length > 0">
        <h2 class="sc-section">{{ $t('matches.lists.notGoing') }}</h2>
        <ol class="sc-card list">
          <li v-for="(n, i) in match.notGoing" :key="n.user.id" class="row">
            <span class="sc-number pos">{{ i + 1 }}</span>
            <span class="name">{{ n.user.nickname }}</span>
            <q-badge v-if="n.tier === 'reserve'" color="grey" :label="$t('matches.reserve')" />
          </li>
        </ol>
      </section>

      <section v-if="match.guestRequests.length > 0">
        <h2 class="sc-section">{{ $t('matches.requests.title') }}</h2>
        <ul class="sc-card list">
          <li v-for="r in match.guestRequests" :key="r.id" class="row">
            <span class="name">{{ r.name }}</span>
            <span class="sc-caption grow">{{ $t('matches.guestOf', { name: r.requestedBy.nickname }) }}</span>
            <template v-if="r.decidable">
              <q-btn color="primary" unelevated no-caps dense :label="$t('matches.requests.approve')" :disable="busy" @click="approve(r)" />
              <q-btn flat no-caps dense color="negative" :label="$t('matches.requests.decline')" :disable="busy" @click="decline(r)" />
            </template>
            <span v-else class="sc-caption">{{ $t('matches.requests.waiting') }}</span>
            <q-btn
              v-if="r.cancellable"
              flat
              no-caps
              dense
              :label="$t('matches.requests.cancel')"
              :disable="busy"
              @click="withdraw(r)"
            />
          </li>
        </ul>
      </section>

      <div class="tools">
        <q-btn flat no-caps class="sc-btn-outline" icon="content_copy" :label="$t('matches.copy')" @click="copy" />
        <q-btn v-if="shareable" flat no-caps class="sc-btn-outline" icon="share" :label="$t('matches.share')" @click="share" />
        <template v-if="match.lineup">
          <q-btn flat no-caps class="sc-btn-outline" icon="content_copy" :label="$t('matches.lineup.copy')" @click="copyTeams" />
          <q-btn
            v-if="shareable"
            flat
            no-caps
            class="sc-btn-outline"
            icon="share"
            :label="$t('matches.lineup.share')"
            @click="shareTeams"
          />
        </template>
      </div>

      <section v-if="match.actions.manage">
        <h2 class="sc-section">{{ $t('matches.settings.title') }}</h2>
        <div class="sc-card settings">
          <SettingsRow icon="event" :title="$t('matches.settings.when')" :summary="summaryOf('when')" @open="whenOpen = true" />
          <SettingsRow
            v-for="s in (['format', 'opening', 'result'] as const)"
            :key="s"
            :icon="s === 'format' ? 'groups' : s === 'opening' ? 'schedule' : 'emoji_events'"
            :title="$t(`matches.settings.${s}`)"
            :summary="summaryOf(s)"
            @open="openSetting(s)"
          />
          <SettingsRow
            icon="emoji_events"
            :title="$t('competitions.match.title')"
            :summary="summaryOf('competitions')"
            @open="competitionsOpen = true"
          />
          <SettingsRow
            v-if="match.series"
            icon="event_repeat"
            :title="$t('matches.series.title')"
            :summary="summaryOf('series')"
            @open="seriesOpen = true"
          />
        </div>
        <div class="danger">
          <q-btn flat no-caps color="negative" icon="event_busy" :label="$t('matches.cancelMatch')" :disable="busy" @click="confirmCancel" />
        </div>
      </section>

      <MatchWhenSheet v-model="whenOpen" :group-id="group.id" :match="match" @saved="edited" />
      <MatchSettingSheet v-model="settingOpen" :group-id="group.id" :match="match" :section="section" @saved="edited" />
      <MatchSeriesSheet v-if="match.series" v-model="seriesOpen" :group-id="group.id" :match="match" @ended="seriesEnded" />
      <MatchCompetitionsSheet v-model="competitionsOpen" :group-id="group.id" :match="match" @saved="edited" />
      <MatchGuestSheet v-model="guestOpen" :group-id="group.id" :match-id="match.id" @saved="guestSaved" />
    </template>
  </div>
</template>

<style scoped>
.back {
  margin-bottom: 8px;
}

.counts {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.counts .grow {
  flex: 1;
}

.counts .link {
  color: var(--q-primary);
}

.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 16px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: 22px;
}

.wave {
  margin-top: 4px;
}

@media (min-width: 600px) {
  .match {
    max-width: 720px;
  }
}

.answer,
.choice,
.organize,
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.answer,
.organize,
.tools {
  margin: 16px 0;
}

.answer {
  flex-direction: column;
  align-items: flex-start;
}

.choice {
  align-self: stretch;
}

.choice > * {
  flex: 1;
}

@media (min-width: 600px) {
  .answer {
    flex-direction: row;
    align-items: center;
  }

  .choice {
    align-self: auto;
  }

  .choice > * {
    flex: none;
  }
}

.danger {
  margin-top: 24px;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
}

.row + .row {
  border-top: 1px solid var(--sc-line);
}

.pos {
  width: 24px;
  text-align: right;
}

.name {
  font-weight: 600;
}

.settings {
  overflow: hidden;
}

.headline {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}

.games {
  overflow: hidden;
}

.game {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 8px 16px 12px;
}

.side.won .sc-caption {
  color: var(--q-primary);
  font-weight: 600;
}

.lineup {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.team {
  overflow: hidden;
}

.team.mine {
  outline: 2px solid var(--q-primary);
}

.team-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--sc-line);
}

.team-empty {
  padding: 10px 16px;
}

.gone .name {
  text-decoration: line-through;
  opacity: 0.6;
}

.settings :deep(.settings-row:last-child) {
  border-bottom: 0;
}

.grow {
  flex: 1;
}

.empty {
  padding: 8px 0;
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
