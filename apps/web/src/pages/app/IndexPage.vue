<template>
  <q-page class="index-page">
    <!-- Hero Section -->
    <div class="q-pa-xl text-center">
      <q-icon name="sports_soccer" size="80px" class="q-mb-md" />
      <h2 class="q-ma-none">Bem-vindo ao Scorely</h2>
      <p
        class="text-grey-8 text-subtitle1 q-mt-sm q-mb-lg"
        style="max-width: 500px; margin: 0 auto"
      >
        A plataforma completa para gerenciar seus times e campeonatos de futebol.
      </p>
    </div>

    <!-- Features Section -->
    <div class="q-pa-lg" style="max-width: 900px; margin: 0 auto">
      <div class="row q-col-gutter-lg">
        <div class="col-12 col-md-4">
          <q-card flat class="feature-card text-center q-pa-md">
            <q-icon name="groups" size="48px" color="primary" />
            <h6 class="q-mt-md q-mb-sm">Gerencie Times</h6>
            <p class="text-grey-8 q-mb-none">
              Crie e organize seus times, adicione jogadores e acompanhe o desempenho.
            </p>
          </q-card>
        </div>

        <div class="col-12 col-md-4">
          <q-card flat class="feature-card text-center q-pa-md">
            <q-icon name="emoji_events" size="48px" color="secondary" />
            <h6 class="q-mt-md q-mb-sm">Crie Campeonatos</h6>
            <p class="text-grey-8 q-mb-none">
              Monte campeonatos personalizados com tabelas, confrontos e classificação.
            </p>
          </q-card>
        </div>

        <div class="col-12 col-md-4">
          <q-card flat class="feature-card text-center q-pa-md">
            <q-icon name="scoreboard" size="48px" color="positive" />
            <h6 class="q-mt-md q-mb-sm">Registre Partidas</h6>
            <p class="text-grey-8 q-mb-none">
              Registre resultados, placar e estatísticas de cada partida disputada.
            </p>
          </q-card>
        </div>
      </div>

      <!-- CTA Section -->
    </div>
  </q-page>
</template>

<script setup lang="ts">
// Página estática de apresentação
</script>
