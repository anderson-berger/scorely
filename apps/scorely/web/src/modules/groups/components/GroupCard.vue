<script lang="ts">
import type { Group, MyGroup } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import StatusChip from '@/components/StatusChip.vue';
import { formatDateTime } from '@/lib/datetime';
import { type CardLine, cardLine, groupColor } from '../groups';
import { initials, type StatusTone, statusTone } from '../scoreboard';

type LineTone = 'accent' | 'neutral' | 'danger';

/**
 * Card de um grupo na tela de Grupos (plano 014, D4–D6): capa, logo sobreposto, nome, esporte e horário,
 * placar e uma frase sobre o estado. Sem logo ou capa, aquele lugar sai da cor do grupo e das iniciais (GRP-30).
 * Grupo arquivado vem sem jogo: sem placar nem selo, só a frase "Arquivado em {data}" (GRP-28).
 */
export default defineComponent({
  name: 'GroupCard',

  components: { StatusChip },

  props: {
    group: { type: Object as PropType<Group & { game?: MyGroup['game'] }>, required: true },
    now: { type: Date, required: true },
  },

  computed: {
    color(): string {
      return `var(--sc-group-${groupColor(this.group.id)})`;
    },

    initials(): string {
      return initials(this.group.name);
    },

    /** GRP-30: a capa do grupo, se houver; senão, as listras com a cor. */
    coverStyle(): Record<string, string> {
      return this.group.coverUrl ? { backgroundImage: `url("${this.group.coverUrl}")` } : {};
    },

    tone(): StatusTone | undefined {
      return this.group.game && statusTone(this.group.game.status);
    },

    meta(): string {
      const g = this.group;
      return `${this.$t(`sports.${g.sport}`)} · ${this.$t(`weekdaysShort.${g.weekday}`)} ${g.time}`;
    },

    line(): CardLine {
      return cardLine(this.group, this.now);
    },

    lineText(): string {
      const l = this.line;
      switch (l.kind) {
        case 'archived':
          return this.$t('groups.card.archived', { date: formatDateTime(l.at) });
        case 'cancelled':
          return this.$t('groups.card.cancelled');
        case 'in_progress':
          return this.$t('groups.card.inProgress');
        case 'playing':
          return this.$t('groups.card.playing', { position: l.position });
        case 'waiting':
          return this.$t('groups.card.waiting', { position: l.position });
        case 'opens':
          return this.$t('groups.card.opens', { date: formatDateTime(l.at) });
        case 'spots':
          return this.$t('groups.card.spots', { count: l.count }, l.count);
        case 'full':
          return this.$t('groups.card.full');
        case 'needs':
          return this.$t('groups.card.needs', { count: l.count }, l.count);
        case 'confirmed':
          return this.$t('groups.card.confirmed');
      }
    },

    lineTone(): LineTone {
      const kind = this.line.kind;
      if (kind === 'cancelled') return 'danger';
      return kind === 'playing' || kind === 'confirmed' ? 'accent' : 'neutral';
    },
  },
});
</script>

<template>
  <router-link
    :to="{ name: 'group', params: { id: group.id } }"
    class="sc-card card"
    :class="{ 'card--off': !group.game || group.game.status === 'cancelled' }"
    :style="{ '--group-color': color }"
  >
    <div class="cover" :style="coverStyle" aria-hidden="true" />
    <StatusChip v-if="group.game && tone" class="status" :tone="tone">{{ $t(`gameStatus.${group.game.status}`) }}</StatusChip>

    <div class="body">
      <div class="sc-display logo" aria-hidden="true"><img v-if="group.logoUrl" :src="group.logoUrl" alt="" /><template v-else>{{ initials }}</template></div>

      <div class="main">
        <div class="info">
          <div class="sc-display name">{{ group.name }}</div>
          <div class="sc-caption meta">{{ meta }}</div>
        </div>
        <div v-if="group.game" class="score">
          <div class="sc-number count">
            {{ group.game.confirmedCount }}<span class="colon">:</span>{{ group.game.slots }}
          </div>
          <div class="legend">{{ $t('groups.scoreLegend') }}</div>
        </div>
      </div>

      <div class="line" :class="`line--${lineTone}`">{{ lineText }}</div>
    </div>
  </router-link>
</template>

<style scoped>
.card {
  position: relative;
  display: block;
  overflow: hidden;
  color: var(--sc-text);
  text-decoration: none;
}

.card--off {
  background: transparent;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

/* Capa substituta: listras escuras e a cor do grupo na borda de baixo (D5). */
.cover {
  height: 120px;
  background: repeating-linear-gradient(135deg, var(--sc-surface-2) 0 12px, var(--sc-surface) 12px 24px);
  border-bottom: 4px solid var(--group-color);
}

/* Só posiciona: a cor é do StatusChip (sobrescrever o fundo apagava o texto do tom accent). */
.status {
  position: absolute;
  top: 12px;
  right: 12px;
}

.body {
  padding: 0 16px 14px;
}

.cover[style*="url"] {
  background-size: cover;
  background-position: center;
}

.logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

.logo {
  width: 56px;
  height: 56px;
  margin-top: -30px;
  position: relative;
  border-radius: 14px;
  border: 3px solid var(--sc-surface);
  background: var(--group-color);
  color: var(--sc-on-accent);
  font-size: 22px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.info {
  min-width: 0;
}

.name {
  font-size: 24px;
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  margin-top: 4px;
}

.score {
  text-align: right;
  flex-shrink: 0;
}

.count {
  font-size: 38px;
  line-height: 1;
  white-space: nowrap;
}

.colon {
  color: var(--sc-dim);
}

.legend {
  font-size: 10px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--sc-muted);
}

.line {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--sc-line);
  font-size: 13px;
  font-weight: 600;
}

.line--neutral {
  color: var(--sc-text-2);
}

.line--accent {
  color: var(--sc-accent);
}

.line--danger {
  color: var(--sc-danger);
}
</style>
