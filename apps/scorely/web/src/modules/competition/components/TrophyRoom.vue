<script lang="ts">
import type { Trophy, TrophyKind } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { type Text, trophyText } from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import { defineComponent } from 'vue';

const ICONS: Record<TrophyKind, string> = {
  champion: 'emoji_events',
  second: 'military_tech',
  third: 'military_tech',
  attendance: 'event_available',
  streak: 'local_fire_department',
};

/** A sala de troféus no perfil (CMP-37, 41): os troféus de todos os grupos. Sem troféus, a seção não aparece. */
export default defineComponent({
  name: 'TrophyRoom',

  data() {
    return { trophies: [] as Trophy[] };
  },

  async mounted() {
    try {
      this.trophies = await competitionApi.myTrophies();
    } catch {
      // Sem a lista, o perfil continua igual; a seção só não aparece.
      this.trophies = [];
    }
  },

  methods: {
    icon(t: Trophy): string {
      return ICONS[t.kind];
    },

    line(t: Trophy): string {
      return trophyText(t)
        .map((p: Text) => this.$t(p.key, p.params ?? {}))
        .join(' · ');
    },

    date(t: Trophy): string {
      return formatDateTime(t.awardedAt, 'date');
    },
  },
});
</script>

<template>
  <section v-if="trophies.length > 0" class="sc-card card" :aria-label="$t('competition.trophies.title')">
    <h2 class="sc-section">{{ $t('competition.trophies.title') }}</h2>
    <div v-for="t in trophies" :key="`${t.seasonId}-${t.kind}`" class="trophy">
      <q-icon :name="icon(t)" size="26px" class="icon" aria-hidden="true" />
      <div class="text">
        <div class="name">{{ line(t) }}</div>
        <div class="sc-caption">{{ date(t) }}</div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  padding: 14px;
}

.trophy {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.trophy:last-child {
  border-bottom: 0;
}

.icon {
  color: var(--sc-accent);
  flex-shrink: 0;
}

.text {
  min-width: 0;
}

.name {
  font-size: 15px;
}
</style>
