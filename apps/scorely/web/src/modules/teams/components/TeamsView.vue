<script lang="ts">
import type { TeamPlayer, Teams } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';

/**
 * Os times, um bloco por time (TIM-14): nome e posição principal no jogo (TIM-13), com as marcas "saiu da lista"
 * (TIM-12) e "do banco" (TIM-08). Para o dono (`editable`), tocar na pessoa emite `select`, e "sem time" aparece.
 */
export default defineComponent({
  name: 'TeamsView',

  props: {
    teams: { type: Object as PropType<Teams>, required: true },
    editable: { type: Boolean, default: false },
    /** Quem vê: o time dele fica em destaque. */
    meId: { type: String, default: '' },
  },

  emits: { select: (_userId: string) => true },

  methods: {
    name(p: TeamPlayer): string {
      return p.name ?? this.$t('groups.unnamed');
    },

    main(p: TeamPlayer): string {
      const first = p.positions[0];
      return first ? this.$t(`teams.positions.${first}`) : '';
    },

    isMine(team: TeamPlayer[]): boolean {
      return Boolean(this.meId) && team.some((p) => p.userId === this.meId);
    },

    select(p: TeamPlayer) {
      if (this.editable) this.$emit('select', p.userId);
    },
  },
});
</script>

<template>
  <div class="teams">
    <div
      v-for="(team, i) in teams.teams"
      :key="i"
      class="sc-card team"
      :class="{ 'team--mine': isMine(team), 'team--empty': team.length === 0 }"
    >
      <div class="team-head">
        <span class="sc-display team-name">{{ $t('teams.teamName', { n: i + 1 }) }}</span>
        <span class="sc-label team-count">{{ team.length }}</span>
        <span v-if="isMine(team)" class="sc-label mine">{{ $t('teams.yourTeam') }}</span>
      </div>
      <component
        :is="editable ? 'button' : 'div'"
        v-for="p in team"
        :key="p.userId"
        :type="editable ? 'button' : undefined"
        class="sc-row person"
        :class="{ 'person--editable': editable, 'person--left': !p.inList }"
        @click="select(p)"
      >
        <span class="pname">{{ name(p) }}</span>
        <span v-if="!p.inList" class="sc-label left">{{ $t('teams.leftList') }}</span>
        <span v-else-if="p.bench" class="sc-label bench">{{ $t('teams.fromBench') }}</span>
        <span v-if="main(p)" class="pos" :class="{ 'pos--adjusted': p.adjusted }">{{ main(p) }}</span>
      </component>
      <div v-if="team.length === 0" class="sc-caption empty">{{ $t('teams.emptyTeam') }}</div>
    </div>

    <div v-if="editable && teams.unassigned.length > 0" class="unassigned">
      <div class="sc-label unassigned-title">
        {{ $t('teams.unassigned', { count: teams.unassigned.length }) }}
      </div>
      <div class="chips">
        <button v-for="p in teams.unassigned" :key="p.userId" type="button" class="chip" @click="select(p)">
          {{ name(p) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.teams {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.team {
  overflow: hidden;
  border-radius: 12px;
}

.team--mine {
  border-color: var(--sc-accent);
}

.team--empty {
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

.team-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sc-line);
}

.team-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1px;
}

.team-count {
  color: var(--sc-muted);
}

.mine {
  margin-left: auto;
  color: var(--sc-accent);
  font-size: 11px;
}

.person {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  background: transparent;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  color: inherit;
  font: inherit;
  text-align: left;
}

.person--editable {
  cursor: pointer;
}

.person--editable:hover {
  background: var(--sc-surface-2);
}

.person--left .pname {
  color: var(--sc-muted);
  text-decoration: line-through;
}

.pname {
  flex-grow: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.left {
  font-size: 10px;
  color: var(--sc-danger);
  white-space: nowrap;
}

.bench {
  font-size: 10px;
  color: var(--sc-muted);
  white-space: nowrap;
}

.pos {
  font-size: 12px;
  font-weight: 700;
  color: var(--sc-accent);
  white-space: nowrap;
}

.pos--adjusted {
  font-style: italic;
}

.empty {
  padding: 12px;
}

.unassigned {
  grid-column: 1 / -1;
}

.unassigned-title {
  font-size: 11px;
  color: var(--sc-muted);
  margin-bottom: 6px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  min-height: 36px;
  padding: 0 12px;
  border: 1px dashed var(--sc-line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--sc-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.chip:hover {
  border-color: var(--sc-accent);
}
</style>
