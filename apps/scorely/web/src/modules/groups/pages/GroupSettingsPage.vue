<script lang="ts">
import type { Group } from '@scorely/contracts';
import SettingsRow from '@scorely/web/src/components/SettingsRow.vue';
import GroupImagesSheet from '@scorely/web/src/modules/groups/components/GroupImagesSheet.vue';
import GroupJoinModeSheet from '@scorely/web/src/modules/groups/components/GroupJoinModeSheet.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { type SettingsSection, settingsSections } from '@scorely/web/src/modules/groups/nav';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-14: Configurações do grupo, uma lista agrupada: Identidade › Logo e capa (GRV-12), Entrada › Quem pode entrar
 * (GRV-38) e Pessoas › Cargos (GRV-50). Cada seção só aparece para quem pode usar uma linha dela (GRV-16): sem nenhuma,
 * a rota leva ao Início (GRV-13).
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
      roleCount: null as number | null,
    };
  },

  computed: {
    sections(): SettingsSection[] {
      return settingsSections(this.group);
    },
  },

  mounted() {
    if (this.sections.length === 0) {
      this.$router.replace({ name: 'group', params: { id: this.group.id } });
      return;
    }
    if (this.sections.some((s) => s.rows.includes('roles'))) this.loadRoleCount();
  },

  methods: {
    /** GRV-14: o número de cargos criados na linha Cargos. */
    async loadRoleCount() {
      try {
        this.roleCount = (await groupsApi.roles(this.group.id)).roles.filter((r) => !r.fixed).length;
      } catch {
        // sem o número a linha continua abrindo a tela, que mostra o erro
      }
    },

    openRoles() {
      this.$router.push({ name: 'group-roles', params: { id: this.group.id } });
    },
  },
});
</script>

<template>
  <div v-if="sections.length > 0">
    <template v-for="section in sections" :key="section.key">
      <h2 class="sc-section">{{ $t(`groups.settings.${section.key}`) }}</h2>
      <div class="sc-card list">
        <template v-for="row in section.rows" :key="row">
          <SettingsRow v-if="row === 'images'" icon="image" :title="$t('groups.images')" @open="imagesOpen = true">
            <img v-if="group.logoUrl" :src="group.logoUrl" alt="" class="thumb logo" />
            <img v-if="group.coverUrl" :src="group.coverUrl" alt="" class="thumb cover" />
          </SettingsRow>
          <SettingsRow
            v-else-if="row === 'joinMode'"
            icon="door_front"
            :title="$t('groups.joinMode.title')"
            :summary="$t(`groups.joinMode.${group.joinMode}`)"
            @open="joinModeOpen = true"
          />
          <SettingsRow
            v-else
            icon="shield_person"
            :title="$t('groups.roles.title')"
            :summary="roleCount === null ? '' : $t('groups.roles.count', { count: roleCount })"
            @open="openRoles"
          />
        </template>
      </div>
    </template>
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
