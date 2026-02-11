<template>
  <div>
    <MenuSection
      v-for="(section, index) in sections"
      :key="section.title"
      :title="section.title"
      :items="section.items"
      :current-route-name="$route.name"
      :class="{ 'q-mt-md': index > 0 }"
      @navigate="navigate"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import MenuSection from 'src/layouts/app-layout/left-drawer/team-menu/MenuSection.vue';
import type { MenuSection as MenuSectionType } from 'src/layouts/app-layout/left-drawer/menu-panel/types';

export default defineComponent({
  name: 'HomeMenu',

  components: { MenuSection },

  emits: ['navigated'],

  data() {
    const sections: MenuSectionType[] = [
      {
        title: 'Principal',
        items: [
          { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', routeName: 'app.home' },
          { key: 'matches', label: 'Partidas', icon: 'sports_soccer', routeName: 'app.home.matches', status: 'dev' },
          { key: 'feed', label: 'Feed', icon: 'feed', routeName: 'app.home.feed', status: 'soon' },
        ],
      },
      {
        title: 'Atividade',
        items: [
          { key: 'notifications', label: 'Notificações', icon: 'notifications', routeName: 'app.home.notifications', status: 'soon' },
          { key: 'invites', label: 'Convites', icon: 'mail', routeName: 'app.home.invites', status: 'soon' },
        ],
      },
    ];

    return { sections };
  },

  methods: {
    navigate(routeName: string) {
      void this.$router.push({ name: routeName });
      this.$emit('navigated');
    },
  },
});
</script>
