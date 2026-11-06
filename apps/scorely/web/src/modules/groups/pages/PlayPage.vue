<script lang="ts">
import type { GuestGame } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage } from '@/i18n/errors';
import GameCard from '../components/GameCard.vue';
import { groupsApi } from '../groups.api';
import { playRedirect } from '../links';

/** `/play/:token`: o jogo da semana pelo link do jogo (plano 007, D7). Quem é do grupo vai para a página do grupo. */
export default defineComponent({
  name: 'PlayPage',

  components: { GameCard },

  data() {
    return {
      view: undefined as GuestGame | undefined,
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
      } catch (err) {
        this.view = undefined;
        this.error = errorMessage(err);
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
  <q-page padding>
    <div class="page">
      <div v-if="error" class="q-mt-lg text-center">
        <div class="text-body1 q-mb-md">{{ error }}</div>
        <q-btn flat color="primary" :label="$t('groups.backHome')" :to="{ name: 'home' }" />
      </div>

      <template v-else-if="view">
        <div class="text-h5">{{ $t('groups.playTitle', { name: view.group.name }) }}</div>
        <div class="text-body2 text-grey-7 q-mb-md">
          {{ $t(`sports.${view.group.sport}`) }} ·
          {{ $t('groups.schedule', { weekday: $t(`weekdays.${view.group.weekday}`), time: view.group.time }) }}
          ({{ view.group.timeZone }})<span v-if="view.group.location"> · {{ view.group.location }}</span>
        </div>
        <GameCard :game="view.game" :busy="busy" @confirm="confirm" @leave="leave" />
      </template>

      <div v-else class="q-mt-lg text-center"><q-spinner size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.page {
  max-width: 640px;
  margin: 0 auto;
}
</style>
