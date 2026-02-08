<!-- components/LeftDrawer/TeamButton.vue -->
<template>
  <div class="team-item-wrapper" :class="{ 'q-mb-xs': isHome }">
    <div class="pill-indicator" :class="{ active, hovered }" />
    <q-btn
      flat
      class="team-btn"
      :class="{ active, 'home-btn': isHome, 'profile-btn': isProfile, 'add-btn': isAdd }"
      @click="$emit('click')"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
    >
      <!-- Ícone simples (Home, Add, etc) -->
      <q-icon v-if="icon" :name="icon" size="24px" :color="isAdd ? 'green-4' : undefined" />

      <!-- Avatar do time -->
      <q-avatar v-else-if="team" size="48px" :class="{ 'avatar-active': active }">
        <img v-if="team.logo" :src="team.logo" alt="Logo" />
        <span v-else class="text-uppercase text-weight-bold">
          {{ team.name ? team.name.substring(0, 2) : '' }}
        </span>
      </q-avatar>

      <q-tooltip v-if="tooltip || team" anchor="center right" self="center left" :offset="[12, 0]">
        <template v-if="team">
          <div class="text-weight-bold">{{ team.name }}</div>
          <div class="text-caption text-grey-4">{{ getRoleLabel(team.member.role!) }}</div>
        </template>
        <template v-else>{{ tooltip }}</template>
      </q-tooltip>
    </q-btn>
  </div>
</template>

<script lang="ts">
import type { TeamWithMember } from '@scorely/api/modules/team/team/team.schemas';
import { defineComponent, type PropType } from 'vue';

export default defineComponent({
  name: 'TeamButton',

  props: {
    team: {
      type: Object as PropType<TeamWithMember>,
      default: null,
    },
    icon: {
      type: String,
      default: '',
    },
    tooltip: {
      type: String,
      default: '',
    },
    active: {
      type: Boolean,
      default: false,
    },
    isHome: {
      type: Boolean,
      default: false,
    },
    isProfile: {
      type: Boolean,
      default: false,
    },
    isAdd: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['click'],

  data() {
    return {
      hovered: false,
    };
  },

  methods: {
    getRoleLabel(role: string): string {
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
.team-item-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-bottom: 8px;
}

/* Pill indicator (barra lateral estilo Discord) */
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

.team-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--sidebar-btn-bg);
  color: var(--sidebar-btn-text);
  transition: all 0.2s ease;
  padding: 0;
  min-height: 48px;
}

.team-btn:hover,
.team-btn.active {
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

.home-btn {
  color: var(--sidebar-home-color);
}

.home-btn:hover,
.home-btn.active {
  background: var(--sidebar-home-hover-bg);
  color: white;
}

.profile-btn {
  color: var(--sidebar-profile-color);
}

.profile-btn:hover,
.profile-btn.active {
  background: var(--sidebar-profile-hover-bg);
  color: white;
}

.add-btn {
  color: var(--sidebar-add-color);
}

.add-btn:hover {
  background: var(--sidebar-add-hover-bg);
  border-radius: 16px;
  color: white;
}

.add-btn:hover .q-icon {
  color: white !important;
}
</style>
