<script lang="ts">
import type { Game, Group, InviteKind } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { formatDateTime } from '@/lib/datetime';
import GroupImagesCard from '../components/GroupImagesCard.vue';
import GroupLinksCard from '../components/GroupLinksCard.vue';
import LayersCard from '../components/LayersCard.vue';
import LimitsCard from '../components/LimitsCard.vue';

/**
 * Aba Ajustes, só do dono (GRP-29): Abertura da lista, Limites (GRP-38), Links de convite, Logo e capa (GRP-35),
 * Dados do grupo (reservado) e Zona de perigo, com cancelar (ou reabrir, GRP-44) o jogo e arquivar o grupo.
 * Grupo arquivado (GRP-37): só "Desarquivar grupo".
 */
export default defineComponent({
  name: 'GroupSettingsPage',

  components: { GroupImagesCard, GroupLinksCard, LayersCard, LimitsCard },

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
    rotate: (_kind: InviteKind) => true,
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
    <LayersCard :group="group" :game="game" :is-owner="isOwner" @saved="$emit('saved')" />

    <LimitsCard :group="group" @saved="$emit('saved')" />

    <section>
      <h2 class="sc-section">{{ $t('groups.settings.links') }}</h2>
      <GroupLinksCard :group="group" :busy="busy" @rotate="$emit('rotate', $event)" />
    </section>

    <GroupImagesCard :group="group" @saved="$emit('saved')" />

    <section>
      <h2 class="sc-section">{{ $t('groups.settings.data') }}</h2>
      <div class="sc-card sc-caption reserved">{{ $t('groups.settings.dataHint') }}</div>
    </section>

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
.sections {
  display: flex;
  flex-direction: column;
  gap: 26px;
}

/* Desktop: as seções lado a lado, em quantas colunas couberem (plano 016, D3). */
@media (min-width: 1024px) {
  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    align-items: start;
  }
}

.reserved {
  padding: 12px 14px;
  border-style: dashed;
  border-color: var(--sc-line-strong);
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
