<script lang="ts">
import type {
  AdvanceMatchWave,
  AttendanceStatus,
  Group,
  Match,
  MatchEntry,
  MatchGuestRequest,
  MatchWave,
} from '@scorely/contracts';
import SettingsRow from '@scorely/web/src/components/SettingsRow.vue';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { currentTimeZone, formatDateTime } from '@scorely/web/src/lib/datetime';
import { canShare } from '@scorely/web/src/modules/groups/invite-link';
import MatchGuestSheet from '@scorely/web/src/modules/matches/components/MatchGuestSheet.vue';
import MatchSettingSheet, {
  type MatchSettingSection,
} from '@scorely/web/src/modules/matches/components/MatchSettingSheet.vue';
import MatchWhenSheet from '@scorely/web/src/modules/matches/components/MatchWhenSheet.vue';
import { matchMessage } from '@scorely/web/src/modules/matches/match.message';
import { durationLabel, durationOf, slotsOf } from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { copyToClipboard } from 'quasar';
import { defineComponent, type PropType } from 'vue';

const WAVES: readonly MatchWave[] = ['members', 'reserves', 'guests'];

/**
 * PAR-18: a página da partida, o link do WhatsApp. O dia, a hora, o recado e a onda numa linha; Vou e Não vou;
 * as listas; e, para quem tem `matches.manage`, os pedidos de convidado, abrir a próxima onda, as configurações da
 * partida (PAR-06) e cancelar.
 * PAR-19: Copiar para o WhatsApp.
 */
export default defineComponent({
  name: 'MatchPage',

  components: { MatchGuestSheet, MatchSettingSheet, MatchWhenSheet, SettingsRow, StatusChip },

  props: {
    group: { type: Object as PropType<Group>, required: true },
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

    shareable(): boolean {
      return canShare();
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

    confirmRemoveGuest(entry: MatchEntry) {
      if (entry.kind !== 'guest') return;
      this.$q
        .dialog({
          title: this.$t('matches.removeGuestConfirm', { name: entry.name }),
          cancel: { label: this.$t('matches.keep'), flat: true },
          ok: { label: this.$t('matches.removeGuest', { name: entry.name }), color: 'negative', flat: true },
        })
        .onOk(() => this.run(() => matchesApi.removeGuest(this.group.id, this.matchId, entry.guestId)));
    },

    confirmCancel() {
      this.$q
        .dialog({
          title: this.$t('matches.cancelTitle'),
          message: this.$t('matches.cancelConfirm'),
          cancel: { label: this.$t('matches.keep'), flat: true },
          ok: { label: this.$t('matches.cancelMatch'), color: 'negative', flat: true },
        })
        .onOk(async () => {
          await this.run(() => matchesApi.cancel(this.group.id, this.matchId));
          this.$q.notify({ type: 'positive', message: this.$t('matches.cancelled') });
        });
    },

    /** PAR-18: o resumo de cada linha das configurações. */
    summaryOf(section: MatchSettingSection | 'when'): string {
      const m = this.match;
      if (!m) return '';
      if (section === 'when') {
        return this.$t('matches.settings.whenSummary', {
          when: this.short(m.startsAt),
          day: formatDateTime(m.startsAt, 'dayMonth'),
          duration: durationLabel(durationOf(m)),
        });
      }
      if (section === 'format') {
        return this.slots === undefined
          ? this.$t('matches.settings.noLimit')
          : this.$t('matches.settings.formatSummary', {
              teams: m.teams,
              players: m.playersPerTeam,
              slots: this.slots,
            });
      }
      const parts = [
        ...(m.membersHours !== undefined
          ? [this.$t('matches.settings.membersAt', { hours: m.membersHours })]
          : []),
        ...(m.reservesHours !== undefined
          ? [this.$t('matches.settings.reservesAt', { hours: m.reservesHours })]
          : []),
        ...(m.noGuests
          ? [this.$t('matches.settings.noGuests')]
          : m.guestsHours !== undefined
            ? [this.$t('matches.settings.guestsAt', { hours: m.guestsHours })]
            : []),
        ...(m.closeHours > 0 ? [this.$t('matches.settings.closeAt', { hours: m.closeHours })] : []),
      ];
      return parts.length > 0 ? parts.join(' · ') : this.$t('matches.settings.openToAll');
    },

    openSetting(section: MatchSettingSection) {
      this.section = section;
      this.settingOpen = true;
    },

    edited(match: Match) {
      this.match = match;
      this.whenOpen = false;
      this.settingOpen = false;
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

    back() {
      this.$router.replace({ name: 'group-matches', params: { id: this.group.id } });
    },
  },
});
</script>

<template>
  <div>
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

      <div v-if="match.status !== 'cancelled'" class="answer">
        <q-btn
          :unelevated="answer === 'going'"
          :outline="answer !== 'going'"
          color="primary"
          no-caps
          class="sc-btn-main"
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
          class="sc-btn-main"
          icon="close"
          :label="$t('matches.notGoing')"
          :disable="busy || (answer !== 'not_going' && !match.actions.notGoing)"
          :aria-pressed="answer === 'not_going'"
          @click="respond('not_going')"
        />
        <q-btn
          v-if="match.actions.requestGuest"
          flat
          no-caps
          class="sc-btn-outline"
          icon="person_add"
          :label="$t('matches.bringGuest')"
          :disable="busy"
          @click="guestOpen = true"
        />
      </div>

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
      </div>

      <div v-if="match.actions.manage" class="tools">
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
        <q-btn flat no-caps color="negative" icon="event_busy" :label="$t('matches.cancelMatch')" :disable="busy" @click="confirmCancel" />
      </div>

      <section v-if="match.actions.manage">
        <h2 class="sc-section">{{ $t('matches.settings.title') }}</h2>
        <div class="sc-card settings">
          <SettingsRow icon="event" :title="$t('matches.settings.when')" :summary="summaryOf('when')" @open="whenOpen = true" />
          <SettingsRow
            v-for="s in (['format', 'opening'] as const)"
            :key="s"
            :icon="s === 'format' ? 'groups' : 'schedule'"
            :title="$t(`matches.settings.${s}`)"
            :summary="summaryOf(s)"
            @open="openSetting(s)"
          />
        </div>
      </section>

      <MatchWhenSheet v-model="whenOpen" :group-id="group.id" :match="match" @saved="edited" />
      <MatchSettingSheet v-model="settingOpen" :group-id="group.id" :match="match" :section="section" @saved="edited" />
      <MatchGuestSheet v-model="guestOpen" :group-id="group.id" :match-id="match.id" @saved="guestSaved" />
    </template>
  </div>
</template>

<style scoped>
.back {
  margin-bottom: 8px;
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

.answer,
.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0;
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
