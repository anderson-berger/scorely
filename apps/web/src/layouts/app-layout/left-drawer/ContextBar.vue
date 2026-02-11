<template>
  <div class="teams-bar">
    <q-scroll-area class="fit">
      <div class="column items-center q-py-sm">
        <HomeButton :active="context === 'home'" />

        <ProfileButton :active="context === 'profile'" />

        <q-separator class="teams-separator" />

        <TeamButton
          v-for="team in teamsWithMember"
          :key="team.id"
          :team-id="team.id"
          :name="team.name ?? 'Time'"
          :logo="formatUrl(team.logo)"
          :role="team.member?.role ?? ''"
          :active="context === 'team' && activeTeamId === team.id"
          @select="selectTeam"
        />

        <q-separator class="teams-separator" />

        <CreateTeamButton />
      </div>
    </q-scroll-area>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import HomeButton from 'src/layouts/app-layout/left-drawer/context-bar/HomeButton.vue';
import ProfileButton from 'src/layouts/app-layout/left-drawer/context-bar/ProfileButton.vue';
import TeamButton from 'src/layouts/app-layout/left-drawer/context-bar/TeamButton.vue';
import CreateTeamButton from 'src/layouts/app-layout/left-drawer/context-bar/CreateTeamButton.vue';
import { teamStore } from 'src/services/stores/TeamStore';

export default defineComponent({
  name: 'ContextBar',

  components: {
    HomeButton,
    ProfileButton,
    TeamButton,
    CreateTeamButton,
  },

  computed: {
    context(): string {
      return (this.$route.meta.context as string) ?? 'home';
    },

    teamsWithMember() {
      return teamStore.teamsWithMember;
    },

    activeTeamId() {
      return teamStore.activeTeamId;
    },
  },

  methods: {
    selectTeam(teamId: string) {
      teamStore.setActiveTeam(teamId);
      void this.$router.push({ name: 'app.team' });
    },

    formatUrl(path: string | undefined): string {
      if (!path) return '';
      if (path.startsWith('http')) return path;
      return `/${path}`;
    },
  },
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
