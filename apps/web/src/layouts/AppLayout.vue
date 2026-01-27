<template>
  <q-layout view="hHh Lpr lFf">
    <!-- Header -->
    <HeaderComponent v-model:drawerOpen="drawerOpen" />

    <!-- Sidebar estilo Discord -->
    <LeftDrawerComponent v-model="drawerOpen" />

    <!-- Conteúdo principal com offset do sidebar -->
    <q-page-container class="main-content">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import HeaderComponent from 'src/layouts/app-layout/HeaderComponent.vue';
import LeftDrawerComponent from 'src/layouts/app-layout/LeftDrawerComponent.vue';

export default defineComponent({
  name: 'AppLayout',

  components: {
    HeaderComponent,
    LeftDrawerComponent,
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
