<script lang="ts">
import type { GuestGame, Teams } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { useAuthStore } from '../../auth/auth.store';
import TeamsView from '../../teams/components/TeamsView.vue';
import { teamsApi } from '../../teams/teams.api';
import GameCard from '../components/GameCard.vue';
import { groupsApi } from '../groups.api';
import { playRedirect } from '../links';

/** `/play/:token`: o jogo da semana pelo link do jogo (plano 007, D7). Quem é do grupo vai para a página do grupo. */
export default defineComponent({
  name: 'PlayPage',

  components: { GameCard, TeamsView },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      view: undefined as GuestGame | undefined,
      /** TIM-09 / GRP-09: os times publicados do jogo. */
      teams: null as Teams | null,
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
        this.teams = await this.loadTeams();
      } catch (err) {
        this.view = undefined;
        this.error = errorMessage(err);
      }
    },

    /** Sem os times a página continua funcionando; eles só não aparecem. */
    async loadTeams(): Promise<Teams | null> {
      try {
        return (await teamsApi.guestTeams(this.token)).teams;
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

    async confirm() {
      const date = this.view?.game.date;
      if (date) await this.run(() => groupsApi.playConfirm(this.token, date));
    },

    async leave() {
      const date = this.view?.game.date;
      if (date) await this.run(() => groupsApi.playLeave(this.token, date));
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
            {{ $t(`sports.${view.group.sport}`) }} ·
            {{ $t('groups.schedule', { weekday: $t(`weekdays.${view.group.weekday}`), time: view.group.time }) }}
            ({{ view.group.timeZone }})<span v-if="view.group.location"> · {{ view.group.location }}</span>
          </div>
        </header>
        <GameCard :game="view.game" :busy="busy" @confirm="confirm" @leave="leave">
          <template v-if="teams" #teams>
            <section class="play-teams">
              <h2 class="sc-section">{{ $t('teams.cardTitle') }}</h2>
              <TeamsView :teams="teams" :me-id="auth.user?.id ?? ''" />
            </section>
          </template>
        </GameCard>
      </template>

      <div v-else class="state"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
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
