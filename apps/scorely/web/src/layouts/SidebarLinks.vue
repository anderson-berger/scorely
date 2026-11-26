<script lang="ts">
import { type NavItem, navItems } from '@scorely/web/src/layouts/nav';
import { groupRailItems, type RailGroup } from '@scorely/web/src/layouts/rail';
import { useGroupsStore } from '@scorely/web/src/modules/groups/groups.store';
import { defineComponent } from 'vue';

/**
 * GRV-13: o conteúdo da barra lateral e do ☰: a seção Meus e os atalhos dos grupos. Trocar de grupo empilha no
 * histórico.
 */
export default defineComponent({
  name: 'SidebarLinks',

  props: {
    /** Só os ícones (600 a 1023px): o nome vai para o `aria-label` e o tooltip. */
    compact: { type: Boolean, default: false },
  },

  emits: {
    navigate: () => true,
  },

  setup() {
    return { groups: useGroupsStore() };
  },

  computed: {
    items(): NavItem[] {
      return navItems();
    },

    /** O id público do grupo aberto, se a rota for de um grupo. */
    openId(): string | undefined {
      const id = this.$route.params.id;
      return typeof id === 'string' && String(this.$route.name ?? '').startsWith('group') ? id : undefined;
    },

    shortcuts(): RailGroup[] {
      return groupRailItems(this.groups.mine, this.openId);
    },
  },

  mounted() {
    if (!this.groups.loaded) this.groups.loadMine().catch(() => undefined);
  },

  methods: {
    isActive(item: NavItem): boolean {
      return this.$route.name === item.to.name;
    },
  },
});
</script>

<template>
  <nav :class="['links', { compact }]" :aria-label="$t('nav.menu')">
    <div v-if="!compact" class="sc-label heading">{{ $t('nav.mine') }}</div>
    <router-link
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      :class="['link', { active: isActive(item) }]"
      :aria-label="$t(`nav.${item.key}`)"
      :aria-current="isActive(item) ? 'page' : undefined"
      @click="$emit('navigate')"
    >
      <span class="mark"><q-icon :name="item.icon" size="24px" aria-hidden="true" /></span>
      <span v-if="!compact" class="text">{{ $t(`nav.${item.key}`) }}</span>
      <q-tooltip v-if="compact" anchor="center right" self="center left" :offset="[8, 0]">
        {{ $t(`nav.${item.key}`) }}
      </q-tooltip>
    </router-link>

    <template v-if="shortcuts.length > 0">
      <div v-if="compact" class="sep" aria-hidden="true" />
      <div v-else class="sc-label heading">{{ $t('nav.shortcuts') }}</div>
    </template>
    <router-link
      v-for="g in shortcuts"
      :key="g.id"
      :to="{ name: 'group', params: { id: g.id } }"
      :class="['link', { active: g.active }]"
      :aria-label="g.name"
      :aria-current="g.active ? 'page' : undefined"
      @click="$emit('navigate')"
    >
      <span class="sc-display mark logo" :style="{ '--group-color': `var(--sc-group-${g.color})` }" aria-hidden="true">
        <img v-if="g.logoUrl" :src="g.logoUrl" alt="" />
        <template v-else>{{ g.initials }}</template>
      </span>
      <span v-if="!compact" class="text">{{ g.name }}</span>
      <q-tooltip v-if="compact" anchor="center right" self="center left" :offset="[8, 0]">{{ g.name }}</q-tooltip>
    </router-link>
  </nav>
</template>

<style scoped>
.links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.heading {
  padding: 12px 8px 4px;
}

.sep {
  align-self: center;
  width: 32px;
  height: 2px;
  flex-shrink: 0;
  margin: 4px 0;
  border-radius: 1px;
  background: var(--sc-line);
}

.link {
  min-height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
  border-radius: 12px;
  color: var(--sc-text-2);
  text-decoration: none;
}

.compact .link {
  align-self: center;
  justify-content: center;
  width: 48px;
  padding: 0;
}

.link.active {
  color: var(--sc-accent);
  background: var(--sc-line);
}

.mark {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo {
  overflow: hidden;
  border-radius: 10px;
  background: var(--group-color);
  color: var(--sc-on-accent);
  font-size: 14px;
  font-weight: 800;
}

.logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text {
  min-width: 0;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
