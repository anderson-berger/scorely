<template>
  <div class="calendar-page q-pa-lg">
    <h4 class="text-white q-mt-none q-mb-lg">Calendário</h4>

    <q-card dark class="bg-grey-9">
      <q-card-section>
        <div class="text-center text-grey-5 q-pa-xl">
          <q-icon name="event" size="64px" class="q-mb-md" />
          <p>Calendário de eventos e partidas</p>
          <p class="text-caption">Em desenvolvimento</p>
        </div>
      </q-card-section>
    </q-card>
  </div>
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
  background: #313338;
  min-height: 100vh;
}
</style>
