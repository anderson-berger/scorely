<script lang="ts">
import { type Group, type GroupImageSlot, MEDIA_PURPOSES } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { prepareImage } from '@scorely/web/src/lib/media';
import { removeGroupImage, uploadGroupImage } from '@scorely/web/src/modules/groups/groups.api';
import { defineComponent, type PropType } from 'vue';

const PURPOSES = { logo: 'group.logo', cover: 'group.cover' } as const;

/** GRV-12: o painel do dono com a miniatura de cada imagem e os botões Trocar e Remover. */
export default defineComponent({
  name: 'GroupImagesSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    /** O grupo como ficou depois da troca (GRV-10). */
    saved: (_group: Group) => true,
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
        const group = await uploadGroupImage(this.group.id, slot, blob);
        this.$q.notify({ type: 'positive', message: this.$t('groups.imageSaved') });
        this.$emit('saved', group);
      } catch (err) {
        const unreadable = err instanceof Error && err.message === 'unreadable';
        this.$q.notify({
          type: 'negative',
          message: unreadable ? this.$t('groups.imageUnreadable') : errorMessage(err),
        });
      } finally {
        this.busy = undefined;
      }
    },

    async remove(slot: GroupImageSlot) {
      this.busy = slot;
      try {
        const group = await removeGroupImage(this.group.id, slot);
        this.$q.notify({ type: 'positive', message: this.$t('groups.imageRemoved') });
        this.$emit('saved', group);
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
  <BottomSheet
    :model-value="modelValue"
    :title="$t('groups.images')"
    :persistent="busy !== undefined"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-caption hint">{{ $t('groups.imagesHint') }}</div>
    <div class="images">
      <div v-for="slot in slots" :key="slot" class="row-item">
        <div :class="['preview', slot]">
          <img v-if="urlOf(slot)" :src="urlOf(slot)" :alt="$t(`groups.${slot}`)" />
          <q-inner-loading :showing="busy === slot" />
        </div>
        <div class="info">
          <div class="name">{{ $t(`groups.${slot}`) }}</div>
          <div v-if="!urlOf(slot)" class="sc-caption">{{ $t('groups.imageEmpty') }}</div>
        </div>
        <div class="actions">
          <q-btn
            outline
            no-caps
            color="primary"
            :label="$t(urlOf(slot) ? 'groups.imageChange' : 'groups.imageUpload')"
            :disable="busy !== undefined"
            @click="pick(slot)"
          />
          <q-btn
            v-if="urlOf(slot)"
            flat
            no-caps
            color="negative"
            :label="$t('groups.imageRemove')"
            :disable="busy !== undefined"
            @click="remove(slot)"
          />
        </div>
      </div>
    </div>
    <input ref="input" type="file" accept="image/*" hidden @change="onPicked" />
  </BottomSheet>
</template>

<style scoped>
.hint {
  margin-top: 4px;
}

.images {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px 0 4px;
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
