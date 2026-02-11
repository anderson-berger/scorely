<template>
  <q-layout view="lHh lpR lFf">
    <LeftDrawer v-model="drawerOpen" />

    <q-page-container class="main-content">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import LeftDrawer from 'src/layouts/app-layout/LeftDrawer.vue';

export default defineComponent({
  name: 'AppLayout',

  components: {
    LeftDrawer,
  },

  props: {},

  emits: [],

  data() {
    return {
      drawerOpen: false,
    };
  },

  computed: {},

  methods: {},

  created() {},

  mounted() {},
});
</script>

<style scoped>
.main-content {
  min-height: 100vh;
}

/* Desktop: conteúdo com offset do sidebar */
@media (min-width: 1024px) {
  .main-content {
    margin-left: 312px; /* 72px (teams bar) + 240px (menu panel) */
  }
}

/* Mobile: sem offset */
@media (max-width: 1023px) {
  .main-content {
    margin-left: 0;
  }
}
</style>
