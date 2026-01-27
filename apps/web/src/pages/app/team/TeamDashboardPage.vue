<template>
  <div class="dashboard-page q-pa-lg">
    <h4 class="text-white q-mt-none q-mb-lg">Dashboard do Time</h4>

    <div class="row q-col-gutter-md">
      <!-- Card de estatísticas -->
      <div class="col-12 col-md-4">
        <q-card dark class="stat-card">
          <q-card-section>
            <div class="text-grey-5 text-caption">Membros</div>
            <div class="text-h4 text-white">12</div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-4">
        <q-card dark class="stat-card">
          <q-card-section>
            <div class="text-grey-5 text-caption">Campeonatos Ativos</div>
            <div class="text-h4 text-white">3</div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-md-4">
        <q-card dark class="stat-card">
          <q-card-section>
            <div class="text-grey-5 text-caption">Partidas este mês</div>
            <div class="text-h4 text-white">8</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Próximas partidas -->
    <h5 class="text-white q-mt-xl q-mb-md">Próximas Partidas</h5>
    <q-card dark class="bg-grey-9">
      <q-list>
        <q-item v-for="i in 3" :key="i">
          <q-item-section avatar>
            <q-icon name="sports_esports" color="primary" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-white">Partida {{ i }}</q-item-label>
            <q-item-label caption class="text-grey-5">vs Adversário {{ i }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-item-label class="text-grey-4">Em 2 dias</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'TeamDashboardPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {};
  },

  computed: {
    teamId(): string {
      return this.$route.params.teamId as string;
    },
  },

  methods: {},

  created() {},

  mounted() {},
});
</script>

<style scoped>
.dashboard-page {
  background: #313338;
  min-height: 100vh;
}

.stat-card {
  background: #2b2d31;
}
</style>
