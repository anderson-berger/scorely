<script lang="ts">
import type { Group, Match, MatchSummary } from '@scorely/contracts';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { can } from '@scorely/web/src/modules/groups/nav';
import MatchWhenSheet from '@scorely/web/src/modules/matches/components/MatchWhenSheet.vue';
import { slotsOf } from '@scorely/web/src/modules/matches/match.settings';
import { matchesApi } from '@scorely/web/src/modules/matches/matches.api';
import { defineComponent, type PropType } from 'vue';

/**
 * PAR-17: a área Partidas. As próximas partidas em cartões (dia e hora, "10 de 12" e a resposta de quem vê);
 * quem tem `matches.manage` vê Criar partida, que abre o painel de baixo.
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
    };
  },

  computed: {
    canManage(): boolean {
      return can(this.group, 'matches.manage');
    },
  },

  watch: {
    'group.id'() {
      this.load();
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

    <div v-if="error" class="sc-caption error">{{ error }}</div>
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
            <span class="sc-number">{{ count(m) }}</span>
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

.when {
  font-size: 18px;
}

.mine {
  font-weight: 600;
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
