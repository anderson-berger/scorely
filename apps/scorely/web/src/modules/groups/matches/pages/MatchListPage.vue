<script lang="ts">
import type { Group, Match, MatchHistoryItem, MatchSummary } from '@scorely/contracts';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import MatchWhenSheet from '@scorely/web/src/modules/groups/matches/components/MatchWhenSheet.vue';
import { resultHeadline } from '@scorely/web/src/modules/groups/matches/match.result';
import { slotsOf } from '@scorely/web/src/modules/groups/matches/match.settings';
import { everyLabel } from '@scorely/web/src/modules/groups/matches/match.summary';
import { matchesApi } from '@scorely/web/src/modules/groups/matches/matches.api';
import { can } from '@scorely/web/src/modules/groups/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * PAR-17: a área Partidas. As próximas partidas em cartões (dia e hora, "10 de 12" e a resposta de quem vê);
 * quem tem `matches.manage` vê Criar partida, que abre o painel de baixo. A partida de uma repetição ativa tem a
 * marca "Toda sexta".
 * PAR-37: no topo, Próximas e Anteriores (o histórico, PAR-36, em páginas, com Carregar mais).
 */
export default defineComponent({
  name: 'MatchListPage',

  components: { MatchWhenSheet, StatusChip },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      matches: [] as MatchSummary[],
      loaded: false,
      error: '',
      formOpen: false,
      tab: 'upcoming' as 'upcoming' | 'past',
      past: [] as MatchHistoryItem[],
      pastCursor: undefined as string | undefined,
      pastLoaded: false,
      pastBusy: false,
      pastError: '',
    };
  },

  computed: {
    canManage(): boolean {
      return can(this.group, 'matches.manage');
    },
  },

  watch: {
    'group.id'() {
      this.past = [];
      this.pastLoaded = false;
      this.load();
    },

    tab(tab: 'upcoming' | 'past') {
      if (tab === 'past' && !this.pastLoaded) this.loadPast();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    when(iso: string): string {
      return this.$t('matches.when', {
        weekday: formatDateTime(iso, 'weekdayShort').replace(/\.$/, ''),
        day: formatDateTime(iso, 'dayMonth'),
        time: formatDateTime(iso, 'time'),
      });
    },

    every(weekday: number): string {
      return everyLabel(weekday);
    },

    count(m: MatchSummary): string {
      const slots = slotsOf(m);
      return slots === undefined
        ? this.$t('matches.countOpen', { confirmed: m.confirmed })
        : this.$t('matches.count', { confirmed: m.confirmed, slots });
    },

    async load() {
      this.error = '';
      try {
        this.matches = await matchesApi.list(this.group.id);
      } catch (err) {
        this.error = errorMessage(err);
      } finally {
        this.loaded = true;
      }
    },

    /** PAR-36, 37: a próxima página do histórico (a primeira, sem cursor). */
    async loadPast(more = false) {
      this.pastBusy = true;
      this.pastError = '';
      try {
        const page = await matchesApi.history(this.group.id, more ? this.pastCursor : undefined);
        this.past = more ? [...this.past, ...page.items] : page.items;
        this.pastCursor = page.nextCursor;
      } catch (err) {
        this.pastError = errorMessage(err);
      } finally {
        this.pastLoaded = true;
        this.pastBusy = false;
      }
    },

    /** PAR-37: "Cancelada", "Sem resultado", "Time 2 venceu", "Empate" ou quem venceu o dia. */
    pastLine(item: MatchHistoryItem): string {
      if (item.status === 'cancelled') return this.$t('matches.status.cancelled');
      return item.result ? resultHeadline(item.result) : this.$t('matches.history.noResult');
    },

    open(m: { id: string }) {
      this.$router.push({ name: 'group-match', params: { id: this.group.id, matchId: m.id } });
    },

    created(match: Match) {
      this.formOpen = false;
      this.open(match);
    },
  },
});
</script>

<template>
  <div>
    <div class="head">
      <h1 class="sc-display title">{{ $t('matches.title') }}</h1>
      <q-btn
        v-if="canManage"
        color="primary"
        unelevated
        no-caps
        icon="add"
        class="sc-btn-main"
        :label="$t('matches.create')"
        @click="formOpen = true"
      />
    </div>

    <q-tabs v-model="tab" no-caps align="left" class="tabs" active-color="primary" indicator-color="primary">
      <q-tab name="upcoming" :label="$t('matches.tabs.upcoming')" />
      <q-tab name="past" :label="$t('matches.tabs.past')" />
    </q-tabs>

    <template v-if="tab === 'past'">
      <div v-if="pastError" class="sc-caption error">{{ pastError }}</div>
      <div v-else-if="!pastLoaded" class="loading"><q-spinner color="primary" size="md" /></div>
      <div v-else-if="past.length === 0" class="sc-caption empty">{{ $t('matches.history.empty') }}</div>
      <template v-else>
        <ul class="cards">
          <li v-for="m in past" :key="m.id">
            <button type="button" class="sc-card card" @click="open(m)">
              <span class="sc-display when">{{ when(m.startsAt) }}</span>
              <span class="sc-caption" :class="{ cancelled: m.status === 'cancelled' }">{{ pastLine(m) }}</span>
            </button>
          </li>
        </ul>
        <div v-if="pastCursor" class="more">
          <q-btn flat no-caps :label="$t('matches.history.more')" :loading="pastBusy" @click="loadPast(true)" />
        </div>
      </template>
    </template>

    <div v-else-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!loaded" class="loading"><q-spinner color="primary" size="md" /></div>
    <div v-else-if="matches.length === 0" class="sc-caption empty">{{ $t('matches.empty') }}</div>
    <ul v-else class="cards">
      <li v-for="m in matches" :key="m.id">
        <button type="button" class="sc-card card" @click="open(m)">
          <span class="top">
            <span class="sc-display when">{{ when(m.startsAt) }}</span>
            <StatusChip :tone="m.status === 'cancelled' ? 'danger' : m.status === 'open' ? 'accent' : 'neutral'">
              {{ $t(`matches.status.${m.status}`) }}
            </StatusChip>
          </span>
          <span class="bottom">
            <span class="count">
              <span class="sc-number">{{ count(m) }}</span>
              <q-badge v-if="m.seriesWeekday" color="grey" :label="every(m.seriesWeekday)" />
            </span>
            <span v-if="m.myAttendance" class="sc-caption mine">{{ $t(`matches.mine.${m.myAttendance}`) }}</span>
          </span>
        </button>
      </li>
    </ul>

    <MatchWhenSheet v-model="formOpen" :group-id="group.id" @saved="created" />
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.title {
  margin: 0;
  font-size: 22px;
}

.cards {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  text-align: left;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.top,
.bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.count {
  display: flex;
  align-items: center;
  gap: 8px;
}

.when {
  font-size: 18px;
}

.mine {
  font-weight: 600;
}

.tabs {
  margin-bottom: 12px;
}

.cancelled {
  color: var(--q-negative);
}

.more {
  display: flex;
  justify-content: center;
  margin: 16px 0;
}

.error,
.empty {
  padding: 24px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
