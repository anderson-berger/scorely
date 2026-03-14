<template>
  <q-page class="overview-page">
    <div v-if="team" class="overview-content">
      <!-- Banner / Cover -->
      <div class="team-banner">
        <div class="banner-overlay" />
      </div>

      <!-- Logo + Info -->
      <div class="team-info">
        <q-avatar size="96px" class="team-avatar" square>
          <img v-if="logoUrl" :src="logoUrl" class="avatar-img" />
          <span v-else class="team-initials text-uppercase text-weight-bold">
            {{ initials }}
          </span>
        </q-avatar>

        <div class="team-details">
          <h4 class="team-name q-my-none">{{ team.name }}</h4>
          <span class="team-role text-grey-5">{{ roleLabel }}</span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { teamStore } from 'src/services/stores/TeamStore';

export default defineComponent({
  name: 'TeamOverviewPage',

  computed: {
    team() {
      return teamStore.activeTeam;
    },

    logoUrl(): string | undefined {
      if (!this.team?.logo) return undefined;
      if (this.team.logo.startsWith('http')) return this.team.logo;
      return `/${this.team.logo}`;
    },

    initials(): string {
      return this.team?.name ? this.team.name.substring(0, 2) : '';
    },

    roleLabel(): string {
      const role = this.team?.member?.role ?? '';
      const labels: Record<string, string> = {
        owner: 'Proprietário',
        admin: 'Administrador',
        member: 'Membro',
      };
      return labels[role] || role;
    },
  },
});
</script>

<style scoped>
.overview-page {
  background: #313338;
  min-height: 100vh;
}

.overview-content {
  max-width: 800px;
  margin: 0 auto;
}

.team-banner {
  height: 200px;
  background: linear-gradient(135deg, #57f287, #5865f2);
  border-radius: 0 0 8px 8px;
  position: relative;
}

.banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 40%, rgba(0, 0, 0, 0.3));
  border-radius: 0 0 8px 8px;
}

.team-info {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 0 24px;
  margin-top: -48px;
  position: relative;
}

.team-avatar {
  border: 4px solid #313338;
  background: #2b2d31;
  border-radius: 16px;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.team-initials {
  font-size: 2rem;
  color: #fff;
}

.team-details {
  padding-bottom: 8px;
}

.team-name {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
}

.team-role {
  font-size: 0.875rem;
}
</style>
