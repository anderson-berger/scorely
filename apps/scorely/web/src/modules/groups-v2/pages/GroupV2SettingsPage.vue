<script lang="ts">
import type { GroupV2 } from '@scorely/contracts';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import GroupV2ImagesSheet from '@scorely/web/src/modules/groups-v2/components/GroupV2ImagesSheet.vue';
import { can } from '@scorely/web/src/modules/groups-v2/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-14: Configurações do grupo, uma lista agrupada. Por enquanto, Identidade › Logo e capa (GRV-12).
 * Só com `group.edit` (GRV-16): para quem não tem, a rota leva ao Início (GRV-13).
 */
export default defineComponent({
  name: 'GroupV2SettingsPage',

  components: { GroupV2ImagesSheet, SettingsRow },

  props: {
    group: { type: Object as PropType<GroupV2>, required: true },
  },

  emits: {
    /** O grupo como ficou depois da troca (GRV-10). */
    saved: (_group: GroupV2) => true,
  },

  data() {
    return {
      imagesOpen: false,
    };
  },

  computed: {
    canEdit(): boolean {
      return can(this.group, 'group.edit');
    },
  },

  mounted() {
    if (!this.canEdit) this.$router.replace({ name: 'group-v2', params: { id: this.group.id } });
  },
});
</script>

<template>
  <div v-if="canEdit">
    <h2 class="sc-section">{{ $t('groupsV2.settings.identity') }}</h2>
    <div class="sc-card list">
      <SettingsRow icon="image" :title="$t('groupsV2.images')" @open="imagesOpen = true">
        <img v-if="group.logoUrl" :src="group.logoUrl" alt="" class="thumb logo" />
        <img v-if="group.coverUrl" :src="group.coverUrl" alt="" class="thumb cover" />
      </SettingsRow>
    </div>
    <GroupV2ImagesSheet v-model="imagesOpen" :group="group" @saved="$emit('saved', $event)" />
  </div>
</template>

<style scoped>
.list {
  overflow: hidden;
}

.list :deep(.settings-row:last-child) {
  border-bottom: 0;
}

.thumb {
  height: 24px;
  border-radius: 6px;
  object-fit: cover;
}

.thumb.logo {
  width: 24px;
}

.thumb.cover {
  width: 64px;
}
</style>
