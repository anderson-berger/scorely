<template>
  <div>
    <!-- Backdrop/Overlay para mobile -->
    <transition name="fade">
      <div v-if="isOpen && isMobile" class="drawer-backdrop" @click="closeDrawer" />
    </transition>

    <!-- Sidebar -->
    <div
      class="discord-sidebar"
      :class="{ 'is-hidden': isMobile && !isOpen, 'mobile-open': isMobile && isOpen }"
    >
      <ContextBar @navigated="closeMobile" />
      <MenuPanel @navigated="closeMobile" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ContextBar from 'src/layouts/app-layout/left-drawer/ContextBar.vue';
import MenuPanel from 'src/layouts/app-layout/left-drawer/MenuPanel.vue';

export default defineComponent({
  name: 'LeftDrawer',

  components: {
    ContextBar,
    MenuPanel,
  },

  props: {
    modelValue: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['update:modelValue'],

  computed: {
    isOpen(): boolean {
      return this.modelValue;
    },

    isMobile(): boolean {
      return this.$q.screen.lt.md;
    },
  },

  methods: {
    closeDrawer() {
      this.$emit('update:modelValue', false);
    },

    closeMobile() {
      if (this.isMobile) {
        this.closeDrawer();
      }
    },
  },
});
</script>

<style scoped>
/* Backdrop overlay */
.drawer-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1999;
}

.discord-sidebar {
  display: flex;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2000;
  transition: transform 0.3s ease;
}

.discord-sidebar.is-hidden {
  transform: translateX(-100%);
}

.discord-sidebar.mobile-open {
  transform: translateX(0);
}

/* Transições */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
