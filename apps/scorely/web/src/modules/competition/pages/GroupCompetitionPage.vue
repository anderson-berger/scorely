<script lang="ts">
import type { Competition, CompetitionPoints, Group, Tiebreak } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import {
  canEditRules,
  POINT_KEYS,
  signed,
  statusText,
} from '@scorely/web/src/modules/competition/competition';
import CompetitionGames from '@scorely/web/src/modules/competition/components/CompetitionGames.vue';
import CompetitionRulesSheet from '@scorely/web/src/modules/competition/components/CompetitionRulesSheet.vue';
import RankingCard from '@scorely/web/src/modules/competition/components/RankingCard.vue';
import { type GroupAccess, NO_ACCESS } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * Aba Competição (CMP-09): o estado no topo e o regulamento só leitura. Quem tem `seasons.manage`, com a competição
 * ativa e o grupo ativo, tem "Mudar regulamento" (o mesmo painel dos Ajustes, CMP-10). Abaixo, os jogos (CMP-18).
 */
export default defineComponent({
  name: 'GroupCompetitionPage',

  components: { CompetitionGames, CompetitionRulesSheet, RankingCard },

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    competition: { type: Object as PropType<Competition | undefined>, default: undefined },
    access: { type: Object as PropType<GroupAccess>, default: () => NO_ACCESS },
  },

  emits: {
    'competition-changed': (_c: Competition) => true,
    'competition-reload': () => true,
  },

  data() {
    return { editing: false };
  },

  computed: {
    status(): string {
      if (!this.competition) return '';
      const t = statusText(this.competition, (iso) => formatDateTime(iso, 'date'));
      return this.$t(t.key, t.params ?? {});
    },

    expired(): boolean {
      return this.competition?.status === 'expired';
    },

    canEdit(): boolean {
      return canEditRules(this.competition, this.access, Boolean(this.group.archivedAt));
    },

    pointKeys(): (keyof CompetitionPoints)[] {
      return POINT_KEYS;
    },
  },

  methods: {
    signed,

    tiebreakName(c: Tiebreak): string {
      return this.$t(`competition.tiebreak.${c}`);
    },
  },
});
</script>

<template>
  <div v-if="competition?.rules" class="sections">
    <RankingCard :group="group" />

    <div class="sc-card status" :class="{ 'status--expired': expired }" role="status">
      <q-icon :name="expired ? 'lock_clock' : 'emoji_events'" size="22px" aria-hidden="true" />
      <span class="sc-display status-text">{{ status }}</span>
    </div>

    <section>
      <div class="head">
        <h2 class="sc-section">{{ $t('competition.rules.title') }}</h2>
        <q-btn
          v-if="canEdit"
          flat
          no-caps
          class="sc-btn-outline"
          icon="edit"
          :label="$t('competition.rules.edit')"
          @click="editing = true"
        />
      </div>

      <div class="sc-card list">
        <div class="sc-caption group-title">{{ $t('competition.pointsTitle') }}</div>
        <div v-for="k in pointKeys" :key="k" class="line">
          <div>
            <div class="name">{{ $t(`competition.points.${k}`) }}</div>
            <div class="sc-caption">{{ $t(`competition.pointsHint.${k}`) }}</div>
          </div>
          <span class="sc-number value">{{ signed(competition.rules.points[k]) }}</span>
        </div>

        <div class="sc-caption group-title">{{ $t('competition.unit.title') }}</div>
        <div class="line">
          <div>
            <div class="name">{{ $t(`competition.unit.${competition.rules.unit}`) }}</div>
            <div class="sc-caption">{{ $t(`competition.unit.${competition.rules.unit}Hint`) }}</div>
          </div>
        </div>

        <div class="sc-caption group-title">{{ $t('competition.tiebreak.title') }}</div>
        <div v-if="competition.rules.tiebreak.length === 0" class="line sc-caption">
          {{ $t('competition.tiebreak.empty') }}
        </div>
        <div v-for="(c, i) in competition.rules.tiebreak" :key="c" class="line">
          <div>
            <div class="name">{{ i + 1 }}. {{ tiebreakName(c) }}</div>
            <div class="sc-caption">{{ $t(`competition.tiebreak.${c}Hint`) }}</div>
          </div>
        </div>
      </div>

      <div class="sc-caption hint">{{ $t('competition.rules.hint') }}</div>
    </section>

    <CompetitionGames :group="group" :competition="competition" :access="access" @reload="$emit('competition-reload')" />

    <CompetitionRulesSheet
      v-if="canEdit"
      v-model="editing"
      :group-id="group.id"
      :competition="competition"
      @saved="$emit('competition-changed', $event)"
      @reload="$emit('competition-reload')"
    />
  </div>
  <div v-else class="state"><q-spinner color="primary" size="md" /></div>
</template>

<style scoped>
.sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 720px;
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  color: var(--sc-accent);
}

.status--expired {
  color: var(--sc-text-2);
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

.status-text {
  font-size: 18px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.list {
  padding: 4px 14px;
}

.group-title {
  margin-top: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.line:last-child {
  border-bottom: 0;
}

.name {
  font-size: 15px;
}

.value {
  font-size: 24px;
  flex-shrink: 0;
}

.hint {
  margin-top: 10px;
}

.state {
  margin-top: 48px;
  text-align: center;
}
</style>
