<template>
  <q-page class="q-pa-lg">
    <h4 class="q-mt-none q-mb-lg">Calendário</h4>

    <q-card>
      <q-card-section>
        <div class="text-center-pa-xl">
          <q-icon name="event" size="64px" class="q-mb-md" />
          <p>Calendário de eventos e partidas</p>
          <p class="text-caption">Em desenvolvimento</p>
        </div>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'TeamCalendarPage',

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
.calendar-page {
  min-height: 100vh;
}
</style>
