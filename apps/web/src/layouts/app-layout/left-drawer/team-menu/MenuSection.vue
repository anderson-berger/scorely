<template>
  <div>
    <q-item-label header class="section-header text-uppercase text-caption">
      {{ title }}
    </q-item-label>

    <q-item
      v-for="item in items"
      :key="item.key"
      :clickable="isClickable(item)"
      :v-ripple="isClickable(item)"
      :active="isClickable(item) && isActiveRoute(item.routeName)"
      active-class="menu-item-active"
      class="menu-item"
      :class="itemClass(item)"
      @click="handleClick(item)"
    >
      <q-item-section avatar>
        <q-icon :name="item.icon" size="20px" />
      </q-item-section>
      <q-item-section>{{ item.label }}</q-item-section>
      <q-item-section v-if="item.status && statusConfig[item.status]" side>
        <q-badge
          :color="statusConfig[item.status].color"
          :label="statusConfig[item.status].label"
          class="status-badge"
        />
      </q-item-section>
    </q-item>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { MenuItem, MenuItemStatus } from 'src/layouts/app-layout/left-drawer/menu-panel/types';

interface StatusConfig {
  label: string;
  color: string;
  clickable: boolean;
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

  data() {
    return {
      statusConfig: {
        dev: { label: 'Dev', color: 'orange', clickable: true },
        disabled: { label: 'Indisponível', color: 'grey', clickable: false },
        deprecated: { label: 'Descontinuado', color: 'red-4', clickable: false },
        soon: { label: 'Em breve', color: 'blue-grey', clickable: false },
      } as Record<MenuItemStatus, StatusConfig>,
    };
  },

  methods: {
    isClickable(item: MenuItem): boolean {
      if (!item.status) return true;
      return this.statusConfig[item.status]?.clickable ?? true;
    },

    isActiveRoute(routeName: string): boolean {
      return this.currentRouteName === routeName;
    },

    itemClass(item: MenuItem): Record<string, boolean> {
      return {
        'item-disabled': !!item.status && !this.isClickable(item),
        'item-dev': item.status === 'dev',
      };
    },

    handleClick(item: MenuItem) {
      if (!this.isClickable(item)) return;
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

.item-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.item-disabled:hover {
  background: transparent;
  color: var(--sidebar-item-text);
}

.item-dev {
  opacity: 0.7;
}

.status-badge {
  font-size: 9px;
  padding: 2px 6px;
}
</style>
