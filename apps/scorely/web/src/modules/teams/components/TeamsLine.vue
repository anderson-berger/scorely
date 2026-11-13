<script lang="ts">
import type { Game, Teams } from '@scorely/contracts';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import type { Text } from '@scorely/web/src/modules/teams/rules';
import { teamsLine } from '@scorely/web/src/modules/teams/teams';
import { teamsApi } from '@scorely/web/src/modules/teams/teams.api';
import { defineComponent, type PropType } from 'vue';

/**
 * A linha Times da aba Jogo (GRP-29): um atalho de uma linha para a aba Times, com o estado dos times.
 * Busca os times sozinha; voltar da aba Times remonta a aba Jogo e busca de novo. Some com o jogo cancelado.
 */
export default defineComponent({
  name: 'TeamsLine',

  props: {
    groupId: { type: String, required: true },
    game: { type: Object as PropType<Game>, required: true },
    isOwner: { type: Boolean, default: false },
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return { teams: undefined as Teams | null | undefined };
  },

  computed: {
    line(): Text | null {
      if (this.teams === undefined || this.game.status === 'cancelled') return null;
      return teamsLine(this.teams, this.auth.user?.id ?? '', this.isOwner);
    },
  },

  watch: {
    game: { immediate: true, handler: 'load' },
  },

  methods: {
    async load() {
      try {
        this.teams = (await teamsApi.teams(this.groupId, this.game.date)).teams;
      } catch {
        // Sem os times a aba Jogo continua funcionando; a linha só não aparece.
        this.teams = undefined;
      }
    },
  },
});
</script>

<template>
  <router-link
    v-if="line"
    :to="{ name: 'group-teams', params: { id: groupId } }"
    class="sc-card teams-line"
    :aria-label="$t('teams.line.open')"
  >
    <q-icon name="groups" size="20px" class="icon" aria-hidden="true" />
    <span class="sc-display text">{{ $t(line.key, line.params ?? {}) }}</span>
    <q-icon name="chevron_right" size="20px" class="chevron" aria-hidden="true" />
  </router-link>
</template>

<style scoped>
.teams-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 10px 14px;
  margin-bottom: 20px;
  color: var(--sc-text);
  text-decoration: none;
  cursor: pointer;
}

.teams-line:hover {
  border-color: var(--sc-accent);
}

.icon {
  color: var(--sc-accent);
}

.text {
  flex: 1;
  font-size: 17px;
}

.chevron {
  color: var(--sc-muted);
}
</style>
