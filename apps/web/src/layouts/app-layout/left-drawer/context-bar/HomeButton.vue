<template>
  <div class="context-item">
    <div class="pill-indicator" :class="{ active, hovered }" />
    <q-btn
      flat
      class="context-btn home-btn"
      :class="{ active }"
      @click="navigate"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <q-icon name="home" size="24px" />
      <q-tooltip anchor="center right" self="center left" :offset="[12, 0]"> Início </q-tooltip>
    </q-btn>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';

export default defineComponent({
  name: 'HomeButton',

  components: {},

  props: {
    active: {
      type: Boolean,
      default: false,
    },
  },
  emits: [],

  data() {
    return {
      hovered: false,
    };
  },

  computed: {},

  methods: {
    navigate() {
      void this.$router.push({ name: 'app.home' });
    },
  },

  created() {},

  mounted() {},
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

.pill-indicator.active {
  opacity: 1;
  height: 40px;
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

.context-btn:hover,
.context-btn.active {
  border-radius: 16px;
}

.home-btn {
  color: var(--sidebar-home-color);
}

.home-btn:hover,
.home-btn.active {
  background: var(--sidebar-home-hover-bg);
  color: white;
}
</style>
