<template>
  <q-card flat bordered class="team-card cursor-pointer" @click="$emit('select', team)">
    <q-card-section class="row items-center no-wrap">
      <!-- Avatar -->
      <q-avatar size="48px" rounded>
        <img :src="team.avatar" />
      </q-avatar>

      <!-- Info -->
      <div class="q-ml-md col">
        <div class="text-weight-medium">
          {{ team.name }}
        </div>
        <div class="text-caption text-grey-6 ellipsis">
          {{ team.description }}
        </div>
      </div>

      <!-- Actions -->
      <div class="row q-gutter-xs">
        <q-btn
          v-if="role !== 'member'"
          flat
          round
          size="sm"
          icon="edit"
          @click.stop="$emit('edit', team)"
        />

        <q-btn
          v-if="role === 'owner' || role === 'admin'"
          flat
          round
          size="sm"
          icon="group"
          @click.stop="$emit('manage', team)"
        />

        <q-btn
          v-if="role === 'owner'"
          flat
          round
          size="sm"
          icon="delete"
          color="negative"
          @click.stop="$emit('delete', team)"
        />

        <q-btn
          v-if="role === 'member'"
          flat
          round
          size="sm"
          icon="logout"
          color="negative"
          @click.stop="$emit('leave', team)"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

interface Team {
  avatar: string;
  name: string;
  description: string;
}
export default defineComponent({
  name: 'TeamCard',

  props: {
    team: { type: Object as PropType<Team>, required: true },
    role: {
      type: String as PropType<'owner' | 'admin' | 'member'>,
      required: true,
    },
  },

  emits: ['select', 'edit', 'manage', 'delete', 'leave'],
});
</script>

<style scoped>
.team-card {
  border-radius: 14px;
}
</style>
