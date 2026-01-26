<template>
  <q-layout view="hHh lpR fFf">
    <q-header class="public-header">
      <q-toolbar class="toolbar-inner">
        <router-link to="/" class="logo-link">
          <q-icon name="sports_soccer" size="24px" class="q-mr-xs" />
          <span class="logo-text">Scorely</span>
        </router-link>

        <q-space />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PublicLayout',
});
</script>

<style scoped>
.public-header {
  background: #1a1a2e !important;
}

.logo-link {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: #fff;
  transition: opacity 0.2s;
}

.logo-link:hover {
  opacity: 0.85;
}

.logo-text {
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.3px;
}
</style>
