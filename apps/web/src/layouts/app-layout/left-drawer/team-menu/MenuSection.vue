<!-- components/LeftDrawer/MenuSection.vue -->
<template>
  <div>
    <q-item-label header class="section-header text-uppercase text-caption">
      {{ title }}
    </q-item-label>

    <q-item
      v-for="item in items"
      :key="item.key"
      clickable
      v-ripple
      :active="isActiveRoute(item.routeName)"
      active-class="menu-item-active"
      class="menu-item"
      @click="handleClick(item)"
    >
      <q-item-section avatar>
        <q-icon :name="item.icon" size="20px" />
      </q-item-section>
      <q-item-section>{{ item.label }}</q-item-section>
    </q-item>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

interface MenuItem {
  key: string;
  label: string;
  icon: string;
  routeName: string;
  params?: Record<string, string>;
}

export default defineComponent({
  name: 'MenuSection',

  props: {
    title: {
      type: String,
      required: true,
    },
    items: {
      type: Array as PropType<MenuItem[]>,
      required: true,
    },
    currentRouteName: {
      type: [String, Symbol] as PropType<string | symbol | null | undefined>,
      default: null,
    },
  },

  emits: ['navigate'],

  methods: {
    isActiveRoute(routeName: string): boolean {
      return this.currentRouteName === routeName;
    },

    handleClick(item: MenuItem) {
      this.$emit('navigate', item.routeName, item.params);
    },
  },
});
</script>

<style scoped>
.section-header {
  color: var(--sidebar-section-text);
}

.menu-item {
  margin: 2px 8px;
  border-radius: 4px;
  color: var(--sidebar-item-text);
  min-height: 34px;
  padding: 6px 8px;
}

.menu-item:hover {
  background: var(--sidebar-item-hover-bg);
  color: var(--sidebar-item-hover-text);
}

.menu-item-active {
  background: var(--sidebar-item-active-bg) !important;
  color: var(--sidebar-item-active-text) !important;
}

.menu-item .q-item__section--avatar {
  min-width: 32px;
}
</style>
