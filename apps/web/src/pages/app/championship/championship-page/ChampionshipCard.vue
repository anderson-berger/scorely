<template>
  <q-card flat bordered class="cursor-pointer" @click="$emit('select', championship)">
    <q-card-section class="row items-center no-wrap">
      <!-- Icon -->
      <q-avatar size="48px" rounded class="bg-primary text-white">
        <q-icon name="emoji_events" />
      </q-avatar>

      <!-- Info -->
      <div class="q-ml-md col">
        <div class="text-weight-medium">
          {{ championship.name }}
        </div>
        <div class="text-caption text-grey-6">
          {{ championship.sport }} • {{ championship.status }}
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
          @click.stop="$emit('edit', championship)"
        />

        <q-btn
          v-if="role !== 'member'"
          flat
          round
          size="sm"
          icon="groups"
          @click.stop="$emit('manage', championship)"
        />

        <q-btn
          v-if="role === 'owner'"
          flat
          round
          size="sm"
          icon="delete"
          color="negative"
          @click.stop="$emit('delete', championship)"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { Championship } from 'src/services/api/ChampionshipService';

export default defineComponent({
  name: 'ChampionshipCard',

  props: {
    championship: {
      type: Object as PropType<Championship>,
      required: true,
    },
    role: {
      type: String as PropType<'owner' | 'admin' | 'member'>,
      required: true,
    },
  },

  emits: ['select', 'edit', 'manage', 'delete'],
});
</script>
