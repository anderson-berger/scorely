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
  name: 'ProfileMenu',

  components: { MenuSection },

  emits: ['navigated'],

  data() {
    const sections: MenuSectionType[] = [
      {
        title: 'Conta',
        items: [
          { key: 'profile', label: 'Perfil', icon: 'person', routeName: 'app.profile.edit' },
          {
            key: 'security',
            label: 'Segurança',
            icon: 'security',
            routeName: 'app.profile.security',
            status: 'soon',
          },
        ],
      },
      {
        title: 'Preferências',
        items: [
          {
            key: 'settings',
            label: 'Configurações',
            icon: 'settings',
            routeName: 'app.profile.settings',
            status: 'soon',
          },
          {
            key: 'appearance',
            label: 'Aparência',
            icon: 'palette',
            routeName: 'app.profile.appearance',
            status: 'soon',
          },
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
