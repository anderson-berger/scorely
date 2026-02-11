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
  name: 'TeamMenu',

  components: { MenuSection },

  props: {
    teamId: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: '',
    },
  },

  emits: ['navigated'],

  computed: {
    sections(): MenuSectionType[] {
      const sections: MenuSectionType[] = [
        {
          title: 'Geral',
          items: [
            {
              key: 'dashboard',
              label: 'Dashboard',
              icon: 'dashboard',
              routeName: 'app.team.dashboard',
            },
            {
              key: 'championships',
              label: 'Campeonatos',
              icon: 'emoji_events',
              routeName: 'app.team.championships',
              status: 'soon',
            },
            {
              key: 'calendar',
              label: 'Calendário',
              icon: 'event',
              routeName: 'app.team.calendar',
              status: 'soon',
            },
          ],
        },
      ];

      if (this.role && ['owner', 'admin'].includes(this.role)) {
        sections.push({
          title: 'Administração',
          items: [
            {
              key: 'members',
              label: 'Membros',
              icon: 'group',
              routeName: 'app.team.members',
              status: 'soon',
            },
            {
              key: 'invites',
              label: 'Convites',
              icon: 'mail',
              routeName: 'app.team.invites',
              status: 'soon',
            },
          ],
        });
      }

      if (this.role === 'owner') {
        sections.push({
          title: 'Configurações',
          items: [
            {
              key: 'settings',
              label: 'Configurações',
              icon: 'settings',
              routeName: 'app.team.settings',
              status: 'soon',
            },
            {
              key: 'billing',
              label: 'Faturamento',
              icon: 'payments',
              routeName: 'app.team.billing',
              status: 'soon',
            },
          ],
        });
      }

      return sections;
    },
  },

  methods: {
    navigate(routeName: string) {
      void this.$router.push({ name: routeName });
      this.$emit('navigated');
    },
  },
});
</script>
