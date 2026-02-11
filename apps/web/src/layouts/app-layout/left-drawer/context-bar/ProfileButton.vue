<template>
  <div class="context-item">
    <div class="pill-indicator" :class="{ active, hovered }" />
    <q-btn
      flat
      class="context-btn profile-btn"
      :class="{ active }"
      @click="navigate"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <q-avatar v-if="avatarUrl" size="48px">
        <img :src="avatarUrl" class="avatar-img" />
      </q-avatar>
      <!-- ICON -->
      <q-icon v-else name="person" size="24px" />
      <q-tooltip anchor="center right" self="center left" :offset="[12, 0]"> Perfil </q-tooltip>
    </q-btn>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { userStore } from 'src/services/stores/UserStore';

export default defineComponent({
  name: 'ProfileButton',

  props: {
    active: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      hovered: false,
    };
  },

  computed: {
    user() {
      return userStore.user;
    },

    avatarUrl(): string | undefined {
      if (!this.user?.avatar) return undefined;

      // garante URL absoluta (evita bug do router)
      return `/${this.user.avatar}`;
    },
  },

  methods: {
    navigate() {
      void this.$router.push({ name: 'app.profile' });
    },
  },
});
</script>

<style scoped>
.context-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 8px;
}

.pill-indicator {
  position: absolute;
  left: 0;
  width: 4px;
  height: 8px;
  background: var(--sidebar-pill-bg);
  border-radius: 0 4px 4px 0;
  transition: height 0.2s ease;
  opacity: 0;
}

.pill-indicator.hovered {
  opacity: 1;
  height: 20px;
}

.pill-indicator.active {
  opacity: 1;
  height: 40px;
}

.context-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--sidebar-btn-bg);
  color: var(--sidebar-btn-text);
  transition: all 0.2s ease;
  padding: 0;
  min-height: 48px;
}

.context-btn:hover,
.context-btn.active {
  border-radius: 16px;
}

.profile-btn {
  color: var(--sidebar-profile-color);
}

.profile-btn:hover,
.profile-btn.active {
  background: var(--sidebar-profile-hover-bg);
  color: white;
}

.profile-btn .q-avatar {
  transition: border-radius 0.2s ease;
}

.profile-btn:hover .q-avatar,
.profile-btn.active .q-avatar {
  border-radius: 16px;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
