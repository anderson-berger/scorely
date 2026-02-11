<template>
  <q-page class="overview-page">
    <div v-if="user" class="overview-content">
      <!-- Banner / Cover -->
      <div class="profile-banner">
        <div class="banner-overlay" />
      </div>

      <!-- Avatar + Info -->
      <div class="profile-info">
        <q-avatar size="96px" class="profile-avatar">
          <img v-if="avatarUrl" :src="avatarUrl" class="avatar-img" />
          <q-icon v-else name="person" size="48px" />
        </q-avatar>

        <div class="profile-details">
          <h4 class="profile-name q-my-none">{{ user.name }}</h4>
          <span class="profile-email text-grey-5">{{ user.email }}</span>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { userStore } from 'src/services/stores/UserStore';

export default defineComponent({
  name: 'ProfileOverviewPage',

  computed: {
    user() {
      return userStore.user;
    },

    avatarUrl(): string | undefined {
      if (!this.user?.avatar) return undefined;
      if (this.user.avatar.startsWith('http')) return this.user.avatar;
      return `/${this.user.avatar}`;
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

.profile-banner {
  height: 200px;
  background: linear-gradient(135deg, #5865f2, #eb459e);
  border-radius: 0 0 8px 8px;
  position: relative;
}

.banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(transparent 40%, rgba(0, 0, 0, 0.3));
  border-radius: 0 0 8px 8px;
}

.profile-info {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  padding: 0 24px;
  margin-top: -48px;
  position: relative;
}

.profile-avatar {
  border: 2px solid #313338;
  background: #2b2d31;
  flex-shrink: 0;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-details {
  padding-bottom: 8px;
}

.profile-name {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
}

.profile-email {
  font-size: 0.875rem;
}
</style>
