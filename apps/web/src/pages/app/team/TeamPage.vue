<template>
  <q-page class="team-page">
    <!-- Se não tem rota filha, mostra o dashboard por padrão -->
    <router-view v-if="hasChildRoute" />
    <TeamDashboardPage v-else />
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import TeamDashboardPage from './TeamDashboardPage.vue';

export default defineComponent({
  name: 'TeamPage',

  components: {
    TeamDashboardPage,
  },

  props: {},

  emits: [],

  data() {
    return {};
  },

  computed: {
    hasChildRoute(): boolean {
      return this.$route.matched.length > 2;
    },
  },

  methods: {},

  created() {},

  mounted() {},
});
</script>

<style scoped>
.team-page {
  padding: 0;
  background: #313338;
  min-height: 100vh;
}
</style>
