<template>
  <div class="context-item">
    <div class="pill-indicator" :class="{ active, hovered }" />
    <q-btn
      flat
      class="context-btn team-btn"
      :class="{ active }"
      @click="navigate"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <q-avatar v-if="logo" size="48px" :class="{ 'avatar-active': active }">
        <img :src="logo" alt="Logo" class="avatar-img" />
      </q-avatar>

      <span v-else class="team-initials text-uppercase text-weight-bold">
        {{ initials }}
      </span>

      <q-tooltip anchor="center right" self="center left" :offset="[12, 0]">
        <div class="text-weight-bold">{{ name }}</div>
        <div class="text-caption text-grey-4">{{ roleLabel }}</div>
      </q-tooltip>
    </q-btn>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'TeamButton',

  emits: ['select'],

  props: {
    teamId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: 'Time',
    },
    logo: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      default: '',
    },
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
    initials(): string {
      return this.name ? this.name.substring(0, 2) : '';
    },

    roleLabel(): string {
      const labels: Record<string, string> = {
        owner: 'Proprietário',
        admin: 'Administrador',
        member: 'Membro',
      };
      return labels[this.role] || this.role;
    },
  },

  methods: {
    navigate() {
      this.$emit('select', this.teamId);
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
  background: var(--sidebar-btn-active-bg);
  color: white;
}

.team-btn .q-avatar {
  transition: border-radius 0.2s ease;
}

.team-btn:hover .q-avatar,
.team-btn.active .q-avatar {
  border-radius: 16px;
}

.team-initials {
  font-size: 14px;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
