<template>
  <q-page>
    <section class="hero flex flex-center column text-center">
      <q-icon name="sports_soccer" size="72px" color="primary" />
      <h1 class="q-mt-md q-mb-sm">Scorely</h1>
      <p class="text-grey-5 text-subtitle1">
        Gerencie campeonatos, times e placares de forma simples
      </p>
      <q-btn
        color="primary"
        text-color="dark"
        unelevated
        no-caps
        rounded
        size="lg"
        label="Comecar agora"
        class="q-mt-lg"
        @click="$router.push({ name: 'auth.login' })"
      />
    </section>

    <section class="features q-pa-xl">
      <div class="row q-col-gutter-lg justify-center">
        <div class="col-12 col-sm-4 text-center">
          <q-icon name="emoji_events" size="48px" color="amber" />
          <h6 class="q-mt-sm q-mb-xs">Campeonatos</h6>
          <p class="text-grey-6">Crie e organize campeonatos facilmente</p>
        </div>
        <div class="col-12 col-sm-4 text-center">
          <q-icon name="groups" size="48px" color="cyan" />
          <h6 class="q-mt-sm q-mb-xs">Times</h6>
          <p class="text-grey-6">Gerencie seus times e jogadores</p>
        </div>
        <div class="col-12 col-sm-4 text-center">
          <q-icon name="leaderboard" size="48px" color="green" />
          <h6 class="q-mt-sm q-mb-xs">Placares</h6>
          <p class="text-grey-6">Acompanhe resultados em tempo real</p>
        </div>
      </div>
    </section>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'HomePage',
});
</script>

<style scoped>
.hero {
  min-height: 60vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
}

.hero h1 {
  font-size: 3rem;
  font-weight: 700;
  letter-spacing: -1px;
}

.features {
  background: #0f0f1a;
}
</style>
