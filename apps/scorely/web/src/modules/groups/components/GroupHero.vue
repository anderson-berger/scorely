<script lang="ts">
import type { Game, Group } from '@scorely/contracts';
import StatusChip from '@scorely/web/src/components/StatusChip.vue';
import { groupColor } from '@scorely/web/src/modules/groups/groups';
import { initials, type StatusTone, statusTone } from '@scorely/web/src/modules/groups/scoreboard';
import { defineComponent, type PropType } from 'vue';

/**
 * Topo da página do grupo (plano 015, D1): capa, logo, nome, esporte e horário e o estado do jogo.
 * As abas ficam fora, no `GroupPage`, para continuarem presas ao rolar. Mesma identidade do `GroupCard`: logo e capa do grupo, ou a cor e as iniciais (GRP-30).
 */
export default defineComponent({
  name: 'GroupHero',

  components: { StatusChip },

  props: {
    group: { type: Object as PropType<Group>, required: true },
    /** Sem jogo no grupo arquivado (GRP-37): o selo do estado não aparece. */
    game: { type: Object as PropType<Game | null>, default: null },
    /** Mostra o fuso do grupo quando é diferente do de quem vê (plano 012, D8). */
    showTimeZone: { type: Boolean, default: false },
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
      return this.game ? statusTone(this.game.status) : undefined;
    },

    meta(): string {
      const g = this.group;
      const when = `${this.$t(`sports.${g.sport}`)} · ${this.$t(`weekdaysShort.${g.weekday}`)} ${g.time}`;
      return this.showTimeZone ? `${when} (${g.timeZone})` : when;
    },
  },
});
</script>

<template>
  <section class="hero" :style="{ '--group-color': color }" :aria-label="group.name">
    <div class="cover" :style="coverStyle" aria-hidden="true" />
    <div class="identity">
      <div class="sc-display logo" aria-hidden="true"><img v-if="group.logoUrl" :src="group.logoUrl" alt="" /><template v-else>{{ initials }}</template></div>
      <div class="text">
        <h1 class="sc-display name">{{ group.name }}</h1>
        <div class="sc-caption meta">{{ meta }}</div>
      </div>
      <StatusChip v-if="game && tone" class="status" :tone="tone">{{ $t(`gameStatus.${game.status}`) }}</StatusChip>
    </div>
  </section>
</template>

<style scoped>
.hero {
  position: relative;
  margin: -16px -16px 0;
}

.cover {
  height: 112px;
  background: repeating-linear-gradient(135deg, var(--sc-surface-2) 0 12px, var(--sc-surface) 12px 24px);
  border-bottom: 4px solid var(--group-color);
}

.identity {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 0 16px;
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
  width: 68px;
  height: 68px;
  margin-top: -34px;
  flex-shrink: 0;
  position: relative;
  border-radius: 18px;
  border: 3px solid var(--sc-bg);
  background: var(--group-color);
  color: var(--sc-on-accent);
  font-size: 26px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.text {
  min-width: 0;
  flex-grow: 1;
  padding-top: 10px;
}

.name {
  margin: 0;
  font-size: 30px;
  line-height: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  margin-top: 4px;
}

/* No celular o selo fica sobre a capa; no desktop, ao lado do nome. */
.status {
  position: absolute;
  top: 12px;
  right: 12px;
}

@media (min-width: 1024px) {
  .hero {
    margin: 0;
    border: 1px solid var(--sc-line);
    border-radius: 18px;
    overflow: hidden;
    background: var(--sc-surface);
  }

  .cover {
    height: 150px;
  }

  .identity {
    padding: 0 24px 18px;
  }

  .logo {
    width: 88px;
    height: 88px;
    margin-top: -44px;
    border-radius: 22px;
    border-color: var(--sc-surface);
    font-size: 34px;
  }

  .name {
    font-size: 40px;
  }

  .status {
    position: static;
    margin-bottom: 4px;
  }
}
</style>
