<template>
  <div class="teams-bar">
    <q-scroll-area class="fit">
      <div class="column items-center q-py-sm">
        <!-- Home -->
        <TeamButton
          icon="home"
          tooltip="Início"
          :active="selection.type === 'home'"
          :is-home="true"
          @click="$emit('select', { type: 'home' })"
        />

        <!-- Perfil -->
        <TeamButton
          icon="person"
          tooltip="Perfil"
          :active="selection.type === 'profile'"
          :is-profile="true"
          @click="$emit('select', { type: 'profile' })"
        />

        <q-separator class="teams-separator" />

        <!-- Times do usuário -->
        <TeamButton
          v-for="team in teams"
          :key="team.id"
          :team="team"
          :active="selection.type === 'team' && selection.teamId === team.id"
          @click="$emit('select', { type: 'team', teamId: team.id })"
        />

        <q-separator class="teams-separator" />

        <!-- Botão criar time -->
        <TeamButton
          icon="add"
          tooltip="Criar novo time"
          :is-add="true"
          @click="$emit('create-team')"
        />
      </div>
    </q-scroll-area>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import TeamButton from 'src/layouts/app-layout/left-drawer/teams-bar/TeamButton.vue';
import type { MyTeam, DrawerSelection } from 'src/layouts/app-layout/left-drawer/types';

export default defineComponent({
  name: 'TeamsBar',

  components: {
    TeamButton,
  },

  props: {
    teams: {
      type: Array as PropType<MyTeam[]>,
      required: true,
    },
    selection: {
      type: Object as PropType<DrawerSelection>,
      required: true,
    },
  },

  emits: ['select', 'create-team'],
});
</script>

<style scoped>
.teams-bar {
  width: 72px;
  background: var(--sidebar-teams-bg);
  padding-top: 12px;
  flex-shrink: 0;
}

.teams-separator {
  width: 32px;
  height: 2px;
  background: var(--sidebar-teams-separator);
  margin: 4px 0 12px;
  border-radius: 1px;
}
</style>
