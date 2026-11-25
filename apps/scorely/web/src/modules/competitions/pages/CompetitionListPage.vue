<script lang="ts">
import type { Competition, CompetitionSummary, Group } from '@scorely/contracts';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { competitionName, periodLine } from '@scorely/web/src/modules/competitions/competition.display';
import { competitionsApi } from '@scorely/web/src/modules/competitions/competitions.api';
import CompetitionSheet from '@scorely/web/src/modules/competitions/components/CompetitionSheet.vue';
import { can } from '@scorely/web/src/modules/groups/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * COM-12: a área Competição. As competições em cartões (o nome, o período, os 3 primeiros e o lugar de quem vê);
 * quem tem `competitions.manage` vê Abrir temporada, que abre o painel de baixo.
 */
export default defineComponent({
  name: 'CompetitionListPage',

  components: { CompetitionSheet, StatusChip },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      items: [] as CompetitionSummary[],
      loaded: false,
      error: '',
      formOpen: false,
    };
  },

  computed: {
    canManage(): boolean {
      return can(this.group, 'competitions.manage');
    },

    /** O N do exemplo "Temporada N": a ordem de criação (COM-02). */
    nextNumber(): number {
      return this.items.reduce((max, c) => Math.max(max, c.number), 0) + 1;
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
    name(c: CompetitionSummary): string {
      return competitionName(c);
    },

    period(c: CompetitionSummary): string {
      return periodLine(c);
    },

    async load() {
      this.error = '';
      try {
        this.items = (await competitionsApi.list(this.group.id)).items;
      } catch (err) {
        this.error = errorMessage(err);
      } finally {
        this.loaded = true;
      }
    },

    open(c: { id: string }) {
      this.$router.push({ name: 'group-competition', params: { id: this.group.id, competitionId: c.id } });
    },

    created(c: Competition) {
      this.formOpen = false;
      this.open(c);
    },
  },
});
</script>

<template>
  <div>
    <div class="head">
      <h1 class="sc-display title">{{ $t('competitions.title') }}</h1>
      <q-btn
        v-if="canManage"
        color="primary"
        unelevated
        no-caps
        icon="add"
        class="sc-btn-main"
        :label="$t('competitions.open')"
        @click="formOpen = true"
      />
    </div>

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!loaded" class="loading"><q-spinner color="primary" size="md" /></div>
    <div v-else-if="items.length === 0" class="sc-caption empty">{{ $t('competitions.empty') }}</div>
    <ul v-else class="cards">
      <li v-for="c in items" :key="c.id">
        <button type="button" class="sc-card card" @click="open(c)">
          <span class="top">
            <span class="sc-display name">{{ name(c) }}</span>
            <StatusChip :tone="c.status === 'open' ? 'accent' : 'neutral'">
              {{ $t(`competitions.status.${c.status}`) }}
            </StatusChip>
          </span>
          <span class="sc-caption">{{ period(c) }}</span>
          <ol v-if="c.podium.length > 0" class="podium">
            <li v-for="row in c.podium" :key="row.user.id">
              <span class="sc-number pos">{{ row.position }}º</span>
              <span class="grow">{{ row.user.nickname }}</span>
              <span class="sc-number">{{ $t('competitions.points', { n: row.points }) }}</span>
            </li>
          </ol>
          <span v-if="c.myPosition" class="sc-caption mine">
            {{ $t('competitions.yourPosition', { n: c.myPosition }) }}
          </span>
        </button>
      </li>
    </ul>

    <CompetitionSheet v-model="formOpen" :group-id="group.id" :next-number="nextNumber" @saved="created" />
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

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.name {
  font-size: 18px;
}

.podium {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.podium li {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pos {
  min-width: 28px;
}

.grow {
  flex: 1;
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
