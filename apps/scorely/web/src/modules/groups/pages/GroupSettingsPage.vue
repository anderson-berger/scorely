<script lang="ts">
import type { Group } from '@scorely/contracts';
import SettingsRow from '@scorely/web/src/components/SettingsRow.vue';
import GroupImagesSheet from '@scorely/web/src/modules/groups/components/GroupImagesSheet.vue';
import GroupJoinModeSheet from '@scorely/web/src/modules/groups/components/GroupJoinModeSheet.vue';
import { can } from '@scorely/web/src/modules/groups/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-14: Configurações do grupo, uma lista agrupada: Identidade › Logo e capa (GRV-12) e Entrada › Quem pode entrar
 * (GRV-38).
 * Só com `group.edit` (GRV-16): para quem não tem, a rota leva ao Início (GRV-13).
 */
export default defineComponent({
  name: 'GroupSettingsPage',

  components: { GroupImagesSheet, GroupJoinModeSheet, SettingsRow },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: {
    /** O grupo como ficou depois da troca (GRV-10). */
    saved: (_group: Group) => true,
  },

  data() {
    return {
      imagesOpen: false,
      joinModeOpen: false,
    };
  },

  computed: {
    canEdit(): boolean {
      return can(this.group, 'group.edit');
    },
  },

  mounted() {
    if (!this.canEdit) this.$router.replace({ name: 'group', params: { id: this.group.id } });
  },
});
</script>

<template>
  <div v-if="canEdit">
    <h2 class="sc-section">{{ $t('groups.settings.identity') }}</h2>
    <div class="sc-card list">
      <SettingsRow icon="image" :title="$t('groups.images')" @open="imagesOpen = true">
        <img v-if="group.logoUrl" :src="group.logoUrl" alt="" class="thumb logo" />
        <img v-if="group.coverUrl" :src="group.coverUrl" alt="" class="thumb cover" />
      </SettingsRow>
    </div>
    <h2 class="sc-section">{{ $t('groups.settings.entry') }}</h2>
    <div class="sc-card list">
      <SettingsRow
        icon="door_front"
        :title="$t('groups.joinMode.title')"
        :summary="$t(`groups.joinMode.${group.joinMode}`)"
        @open="joinModeOpen = true"
      />
    </div>
    <GroupImagesSheet v-model="imagesOpen" :group="group" @saved="$emit('saved', $event)" />
    <GroupJoinModeSheet v-model="joinModeOpen" :group="group" @saved="$emit('saved', $event)" />
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
