<script lang="ts">
import { type Group, type GroupImageSlot, MEDIA_PURPOSES } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { errorMessage } from '@/i18n/errors';
import { prepareImage } from '@/lib/media';
import { removeGroupImage, uploadGroupImage } from '../groups.api';

const PURPOSES = { logo: 'group.logo', cover: 'group.cover' } as const;

/** Logo e capa na aba Ajustes, só do dono (GRP-29, GRP-35): enviar, trocar e remover. */
export default defineComponent({
  name: 'GroupImagesCard',

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: {
    saved: () => true,
  },

  data() {
    return {
      busy: undefined as GroupImageSlot | undefined,
      picking: 'logo' as GroupImageSlot,
      slots: ['logo', 'cover'] as GroupImageSlot[],
    };
  },

  methods: {
    urlOf(slot: GroupImageSlot): string | undefined {
      return slot === 'logo' ? this.group.logoUrl : this.group.coverUrl;
    },

    pick(slot: GroupImageSlot) {
      this.picking = slot;
      (this.$refs.input as HTMLInputElement).click();
    },

    async onPicked(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const slot = this.picking;
      this.busy = slot;
      try {
        // MID-03: recorta e reduz no navegador, no tamanho da finalidade
        const blob = await prepareImage(file, MEDIA_PURPOSES[PURPOSES[slot]]).catch(() => {
          throw new Error('unreadable');
        });
        await uploadGroupImage(this.group.id, slot, blob);
        this.$q.notify({ type: 'positive', message: this.$t('groups.settings.imageSaved') });
        this.$emit('saved');
      } catch (err) {
        const unreadable = err instanceof Error && err.message === 'unreadable';
        this.$q.notify({
          type: 'negative',
          message: unreadable ? this.$t('groups.settings.imageUnreadable') : errorMessage(err),
        });
      } finally {
        this.busy = undefined;
      }
    },

    async remove(slot: GroupImageSlot) {
      this.busy = slot;
      try {
        await removeGroupImage(this.group.id, slot);
        this.$q.notify({ type: 'positive', message: this.$t('groups.settings.imageRemoved') });
        this.$emit('saved');
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = undefined;
      }
    },
  },
});
</script>

<template>
  <section>
    <h2 class="sc-section">{{ $t('groups.settings.images') }}</h2>
    <div class="sc-card images">
      <div class="sc-caption">{{ $t('groups.settings.imagesHint') }}</div>
      <div v-for="slot in slots" :key="slot" class="row-item">
        <div :class="['preview', slot]">
          <img v-if="urlOf(slot)" :src="urlOf(slot)" :alt="$t(`groups.settings.${slot}`)" />
          <q-inner-loading :showing="busy === slot" />
        </div>
        <div class="info">
          <div class="name">{{ $t(`groups.settings.${slot}`) }}</div>
          <div v-if="!urlOf(slot)" class="sc-caption">{{ $t('groups.settings.imageEmpty') }}</div>
        </div>
        <div class="actions">
          <q-btn
            outline
            no-caps
            color="primary"
            :label="$t(urlOf(slot) ? 'groups.settings.imageChange' : 'groups.settings.imageUpload')"
            :disable="busy !== undefined"
            @click="pick(slot)"
          />
          <q-btn
            v-if="urlOf(slot)"
            flat
            no-caps
            color="negative"
            :label="$t('groups.settings.imageRemove')"
            :disable="busy !== undefined"
            @click="remove(slot)"
          />
        </div>
      </div>
      <input ref="input" type="file" accept="image/*" hidden @change="onPicked" />
    </div>
  </section>
</template>

<style scoped>
.images {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 14px;
}

.row-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview {
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
  background: repeating-linear-gradient(135deg, var(--sc-surface-2) 0 8px, var(--sc-surface) 8px 16px);
  border: 1px solid var(--sc-line);
}

.preview.logo {
  width: 48px;
  height: 48px;
  border-radius: 12px;
}

/* Mesma proporção da capa (1600×600) */
.preview.cover {
  width: 96px;
  height: 36px;
  border-radius: 6px;
}

.preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.info {
  flex-grow: 1;
  min-width: 0;
}

.name {
  font-weight: 700;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
}
</style>
