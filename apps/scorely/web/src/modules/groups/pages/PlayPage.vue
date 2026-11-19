<script lang="ts">
import type { GuestGame, Teams } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import GameCard from '@scorely/web/src/modules/groups/components/GameCard.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { playRedirect } from '@scorely/web/src/modules/groups/links';
import { useSportsStore } from '@scorely/web/src/modules/sports/sports.store';
import TeamsView from '@scorely/web/src/modules/teams/components/TeamsView.vue';
import { teamsApi } from '@scorely/web/src/modules/teams/teams.api';
import { defineComponent } from 'vue';

/** `/play/:token`: os próximos jogos do grupo pelo link do jogo (GRP-09). Quem é do grupo vai para a página do grupo. */
export default defineComponent({
  name: 'PlayPage',

  components: { GameCard, TeamsView },

  setup() {
    return { sports: useSportsStore(), auth: useAuthStore() };
  },

  data() {
    return {
      view: undefined as GuestGame | undefined,
      /** TIM-09 / GRP-09: os times publicados de cada jogo, pelo id. */
      teams: {} as Record<string, Teams | null>,
      error: '',
      busy: false,
    };
  },

  computed: {
    token(): string {
      return String(this.$route.params.token);
    },
  },

  watch: {
    token: { immediate: true, handler: 'load' },
  },

  methods: {
    async load() {
      this.error = '';
      try {
        const view = await groupsApi.play(this.token);
        const target = playRedirect(view);
        if (target) {
          await this.$router.replace(target);
          return;
        }
        this.view = view;
        const entries = await Promise.all(
          view.games.map(async (g) => [g.id, await this.loadTeams(g.id)] as const),
        );
        this.teams = Object.fromEntries(entries);
      } catch (err) {
        this.view = undefined;
        this.error = errorMessage(err);
      }
    },

    /** Sem os times a página continua funcionando; eles só não aparecem. */
    async loadTeams(gameId: string): Promise<Teams | null> {
      try {
        return (await teamsApi.guestTeams(this.token, gameId)).teams;
      } catch {
        return null;
      }
    },

    async run(action: () => Promise<unknown>) {
      this.busy = true;
      try {
        await action();
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = false;
        await this.load();
      }
    },

    async confirm(gameId: string) {
      await this.run(() => groupsApi.playConfirm(this.token, gameId));
    },

    async leave(gameId: string) {
      await this.run(() => groupsApi.playLeave(this.token, gameId));
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page">
      <div v-if="error" class="state">
        <div class="state-text">{{ error }}</div>
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.backToGroups')" :to="{ name: 'groups' }" />
      </div>

      <template v-else-if="view">
        <!-- GRP-36: o convidado também vê a capa e o logo -->
        <img v-if="view.group.coverUrl" class="cover" :src="view.group.coverUrl" alt="" />
        <header class="title">
          <img v-if="view.group.logoUrl" class="logo" :src="view.group.logoUrl" alt="" />
          <div class="sc-label sc-accent">{{ $t('groups.gameWeek') }}</div>
          <h1 class="sc-title name">{{ view.group.name }}</h1>
          <div class="sc-caption meta">
            {{ sports.sportName(view.group.sportId) }} ({{ view.group.timeZone }})
          </div>
        </header>
        <!-- GRP-09: um card por próximo jogo, em ordem de início. -->
        <GameCard
          v-for="game in view.games"
          :key="game.id"
          class="play-game"
          :game="game"
          :busy="busy"
          @confirm="confirm(game.id)"
          @leave="leave(game.id)"
        >
          <template v-if="teams[game.id]" #teams>
            <section class="play-teams">
              <h2 class="sc-section">{{ $t('teams.cardTitle') }}</h2>
              <TeamsView :teams="teams[game.id]!" :sport-id="view.group.sportId" :me-id="auth.user?.id ?? ''" />
            </section>
          </template>
        </GameCard>
      </template>

      <div v-else class="state"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.play-game {
  margin-bottom: 16px;
}

.play-teams {
  margin-bottom: 20px;
}

.cover {
  display: block;
  width: 100%;
  aspect-ratio: 1600 / 600;
  object-fit: cover;
  border-radius: 12px;
  margin-top: 12px;
}

.logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: cover;
  margin-bottom: 8px;
}

.state {
  margin-top: 48px;
  text-align: center;
}

.state-text {
  font-size: 16px;
  margin-bottom: 16px;
}

.title {
  padding: 24px 0 18px;
}

.name {
  font-size: 56px;
  margin-top: 8px;
}

.meta {
  margin-top: 10px;
}
</style>
