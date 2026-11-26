<script lang="ts">
import type { Competition, CompetitionCut, CompetitionRankingRow, Group } from '@scorely/contracts';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import {
  competitionName,
  dayLabel,
  periodLine,
  rowLine,
} from '@scorely/web/src/modules/groups/competitions/competition.display';
import { competitionsApi } from '@scorely/web/src/modules/groups/competitions/competitions.api';
import CompetitionSheet from '@scorely/web/src/modules/groups/competitions/components/CompetitionSheet.vue';
import { defineComponent, type PropType } from 'vue';

const CUTS: readonly CompetitionCut[] = ['all', 'male', 'female'];

/**
 * COM-13: a página da competição. O nome, as datas, a situação e os pontos; no grupo misto (GRV-52), Geral, Masculino e
 * Feminino no topo (nos outros, sem abas, só o geral); e o ranking (posição, foto e apelido, pontos e a linha dos jogos), com a linha de quem vê marcada. Para quem tem
 * `competitions.manage`, até travar: Editar e Encerrar agora.
 */
export default defineComponent({
  name: 'CompetitionPage',

  components: { CompetitionSheet, StatusChip },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      competition: undefined as Competition | undefined,
      cut: 'all' as CompetitionCut,
      cuts: CUTS,
      error: '',
      busy: false,
      editOpen: false,
    };
  },

  computed: {
    competitionId(): string {
      return String(this.$route.params.competitionId ?? '');
    },

    title(): string {
      return this.competition ? competitionName(this.competition) : '';
    },

    dates(): string {
      const c = this.competition;
      return c ? `${dayLabel(c.startDate)} – ${dayLabel(c.endDate)} · ${periodLine(c)}` : '';
    },

    /** COM-13: as abas só no grupo misto; nos outros, o `cut` fica `all`. */
    showCuts(): boolean {
      return this.group.modality === 'mixed';
    },

    pointsLine(): string {
      const p = this.competition?.points;
      return p ? this.$t('competitions.pointsLine', { win: p.win, draw: p.draw, loss: p.loss }) : '';
    },
  },

  watch: {
    competitionId() {
      this.load();
    },

    cut() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    line(row: CompetitionRankingRow): string {
      return rowLine(row);
    },

    mine(row: CompetitionRankingRow): boolean {
      return row.user.id === this.auth.user?.id;
    },

    async load() {
      this.error = '';
      try {
        this.competition = await competitionsApi.get(this.group.id, this.competitionId, this.cut);
      } catch (err) {
        this.error = errorMessage(err);
      }
    },

    saved(c: Competition) {
      this.editOpen = false;
      this.competition = c.cut === this.cut ? c : this.competition;
      if (c.cut !== this.cut) this.load();
    },

    /** COM-13: com `VERSION_CONFLICT`, relê e fecha o painel (o aviso já saiu). */
    conflicted() {
      this.editOpen = false;
      this.load();
    },

    confirmClose() {
      this.$q
        .dialog({
          title: this.$t('competitions.closeTitle'),
          message: this.$t('competitions.closeConfirm'),
          cancel: { label: this.$t('competitions.keep'), flat: true },
          ok: { label: this.$t('competitions.close'), color: 'negative', flat: true },
        })
        .onOk(async () => {
          this.busy = true;
          try {
            await competitionsApi.close(this.group.id, this.competitionId);
            await this.load();
            this.$q.notify({ type: 'positive', message: this.$t('competitions.closed') });
          } catch (err) {
            this.$q.notify({ type: 'negative', message: errorMessage(err) });
          } finally {
            this.busy = false;
          }
        });
    },

    back() {
      this.$router.replace({ name: 'group-competitions', params: { id: this.group.id } });
    },
  },
});
</script>

<template>
  <div>
    <q-btn flat no-caps dense icon="chevron_left" :label="$t('competitions.back')" class="back" @click="back" />

    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!competition" class="loading"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <header class="head">
        <div class="title-row">
          <h1 class="sc-display title">{{ title }}</h1>
          <StatusChip :tone="competition.status === 'open' ? 'accent' : 'neutral'">
            {{ $t(`competitions.status.${competition.status}`) }}
          </StatusChip>
        </div>
        <div class="sc-caption">{{ dates }}</div>
        <div class="sc-caption">{{ pointsLine }}</div>
      </header>

      <q-tabs
        v-if="showCuts"
        v-model="cut"
        no-caps align="left" class="tabs" active-color="primary" indicator-color="primary">
        <q-tab v-for="c in cuts" :key="c" :name="c" :label="$t(`competitions.cuts.${c}`)" />
      </q-tabs>

      <div v-if="competition.ranking.length === 0" class="sc-caption empty">{{ $t('competitions.nobody') }}</div>
      <ol v-else class="sc-card list">
        <li v-for="row in competition.ranking" :key="row.user.id" class="row" :class="{ me: mine(row) }">
          <span class="sc-number pos">{{ row.position }}</span>
          <q-avatar size="32px">
            <img v-if="row.user.avatarUrl" :src="row.user.avatarUrl" alt="" />
            <q-icon v-else name="person" />
          </q-avatar>
          <span class="who">
            <span class="name">{{ row.user.nickname }}</span>
            <span class="sc-caption">{{ line(row) }}</span>
          </span>
          <span class="sc-number pts">{{ $t('competitions.points', { n: row.points }) }}</span>
        </li>
      </ol>

      <div v-if="competition.actions.manage" class="tools">
        <q-btn flat no-caps class="sc-btn-outline" icon="edit" :label="$t('competitions.edit')" :disable="busy" @click="editOpen = true" />
        <q-btn flat no-caps color="negative" icon="flag" :label="$t('competitions.close')" :disable="busy" @click="confirmClose" />
      </div>

      <CompetitionSheet
        v-model="editOpen"
        :group-id="group.id"
        :competition="competition"
        @saved="saved"
        @conflict="conflicted"
      />
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

.tabs {
  margin-bottom: 12px;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
}

.row.me {
  background: color-mix(in srgb, var(--q-primary) 14%, transparent);
}

.pos {
  min-width: 24px;
  text-align: right;
}

.who {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-weight: 600;
}

.pts {
  font-size: 16px;
}

.tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
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
