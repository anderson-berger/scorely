<script lang="ts">
import type { Game, Group } from '@scorely/contracts';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import CapacityCard from '@scorely/web/src/modules/groups/components/CapacityCard.vue';
import GroupImagesCard from '@scorely/web/src/modules/groups/components/GroupImagesCard.vue';
import LayersCard from '@scorely/web/src/modules/groups/components/LayersCard.vue';
import LimitsCard from '@scorely/web/src/modules/groups/components/LimitsCard.vue';
import TeamSettingsRows from '@scorely/web/src/modules/teams/components/TeamSettingsRows.vue';
import { defineComponent, type PropType } from 'vue';

/**
 * Aba Ajustes, só do dono (GRP-29): uma lista, cada linha com o resumo e o lugar de mudar (Abertura da lista, Vagas e
 * mínimo, Limites, Times, Logo e capa), e a zona de perigo no fim, com cancelar (ou reabrir, GRP-44) e arquivar.
 * Grupo arquivado (GRP-37): só "Desarquivar grupo".
 */
export default defineComponent({
  name: 'GroupSettingsPage',

  components: { CapacityCard, GroupImagesCard, LayersCard, LimitsCard, TeamSettingsRows },

  inheritAttrs: false,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game | null>, default: null },
    busy: { type: Boolean, default: false },
    isOwner: { type: Boolean, default: false },
    canCancel: { type: Boolean, default: false },
    canReopen: { type: Boolean, default: false },
  },

  emits: {
    saved: () => true,
    cancel: () => true,
    reopen: () => true,
    archive: () => true,
    unarchive: () => true,
  },

  computed: {
    gameDate(): string {
      return this.game ? formatDateTime(this.game.startsAt) : '';
    },
  },
});
</script>

<template>
  <div v-if="isOwner && group.archivedAt" class="sections">
    <section>
      <h2 class="sc-section">{{ $t('groups.settings.danger') }}</h2>
      <div class="sc-card danger danger--calm">
        <div class="danger-text">{{ $t('groups.settings.unarchiveHint') }}</div>
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('groups.settings.unarchive')"
          :disable="busy"
          @click="$emit('unarchive')"
        />
      </div>
    </section>
  </div>

  <div v-else-if="isOwner && game" class="sections">
    <div class="sc-card settings-list">
      <LayersCard :group="group" :game="game" :is-owner="isOwner" @saved="$emit('saved')" />
      <CapacityCard :group="group" @saved="$emit('saved')" />
      <LimitsCard :group="group" @saved="$emit('saved')" />
      <TeamSettingsRows :group="group" />
      <GroupImagesCard :group="group" @saved="$emit('saved')" />
    </div>

    <section>
      <h2 class="sc-section danger-title">{{ $t('groups.settings.danger') }}</h2>
      <div class="sc-card danger-list">
        <div v-if="canCancel" class="danger">
          <div class="danger-text">{{ $t('groups.settings.dangerHint', { date: gameDate }) }}</div>
          <q-btn
            flat
            no-caps
            class="sc-btn-outline cancel"
            :label="$t('groups.cancelGame')"
            :disable="busy"
            @click="$emit('cancel')"
          />
        </div>
        <div v-else-if="canReopen" class="danger">
          <div class="danger-text">{{ $t('groups.settings.reopenHint', { date: gameDate }) }}</div>
          <q-btn
            flat
            no-caps
            class="sc-btn-outline"
            :label="$t('groups.reopenGame')"
            :disable="busy"
            @click="$emit('reopen')"
          />
        </div>
        <div class="danger">
          <div class="danger-text">{{ $t('groups.settings.archiveHint') }}</div>
          <q-btn
            flat
            no-caps
            class="sc-btn-outline cancel"
            :label="$t('groups.settings.archive')"
            :disable="busy"
            @click="$emit('archive')"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* GRP-29: uma coluna só, com largura máxima, para a lista não esticar na tela larga. */
.sections {
  display: flex;
  flex-direction: column;
  gap: 26px;
  max-width: 720px;
}

.settings-list {
  overflow: hidden;
}

/* O fio entre as linhas: a última não tem. */
.settings-list > :last-child :deep(.settings-row) {
  border-bottom: 0;
}

.danger-title {
  color: var(--sc-danger);
}

.danger-list {
  border-color: var(--sc-danger-line);
}

/* Uma linha por ação, separadas por um fio. */
.danger + .danger {
  border-top: 1px solid var(--sc-danger-line);
}

.danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}

.danger--calm {
  border-color: var(--sc-line);
}

.danger-text {
  font-size: 13px;
  color: var(--sc-text-2);
}

.cancel {
  flex-shrink: 0;
  border: 1px solid var(--sc-danger);
  color: var(--sc-danger);
}
</style>
