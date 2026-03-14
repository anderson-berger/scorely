<template>
  <div class="championships-page q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <h4 class="text-white q-mt-none q-mb-none">Campeonatos</h4>
      <q-btn color="primary" icon="add" label="Inscrever em Campeonato" />
    </div>

    <q-card dark class="bg-grey-9">
      <q-list separator>
        <q-item v-for="i in 5" :key="i" clickable v-ripple>
          <q-item-section avatar>
            <q-avatar color="primary" text-color="white">
              <q-icon name="emoji_events" />
            </q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-white">Campeonato {{ i }}</q-item-label>
            <q-item-label caption class="text-grey-5">
              Fase de grupos - 8 times participantes
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge :color="i % 2 === 0 ? 'green' : 'orange'">
              {{ i % 2 === 0 ? 'Ativo' : 'Pendente' }}
            </q-badge>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'TeamChampionshipsPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {};
  },

  computed: {},

  methods: {},

  created() {},

  mounted() {},
});
</script>

<style scoped>
.championships-page {
  background: #313338;
  min-height: 100vh;
}
</style>
