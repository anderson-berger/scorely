<template>
  <div class="context-item">
    <div class="pill-indicator" :class="{ hovered }" />
    <q-btn
      flat
      class="context-btn create-team-btn"
      @click="createTeam"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <q-icon name="add" size="24px" />
      <q-tooltip anchor="center right" self="center left" :offset="[12, 0]"> Criar time </q-tooltip>
    </q-btn>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { teamStore } from 'src/services/stores/TeamStore';

export default defineComponent({
  name: 'CreateTeamButton',

  data() {
    return {
      hovered: false,
    };
  },

  methods: {
    createTeam() {
      void teamStore.createTeam();
    },
  },
});
</script>

<style scoped>
.context-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 8px;
}

.pill-indicator {
  position: absolute;
  left: 0;
  width: 4px;
  height: 8px;
  background: var(--sidebar-pill-bg);
  border-radius: 0 4px 4px 0;
  transition: height 0.2s ease;
  opacity: 0;
}

.pill-indicator.hovered {
  opacity: 1;
  height: 20px;
}

.context-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--sidebar-btn-bg);
  color: var(--sidebar-btn-text);
  transition: all 0.2s ease;
  padding: 0;
  min-height: 48px;
}

.context-btn:hover {
  border-radius: 16px;
}

.create-team-btn {
  color: var(--sidebar-add-color);
}

.create-team-btn:hover {
  background: var(--sidebar-add-hover-bg);
  color: white;
}

.create-team-btn:hover .q-icon {
  color: white !important;
}
</style>
