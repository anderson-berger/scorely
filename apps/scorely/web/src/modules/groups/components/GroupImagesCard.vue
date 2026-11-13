<script lang="ts">
import { type Group, type GroupImageSlot, MEDIA_PURPOSES } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { prepareImage } from '@scorely/web/src/lib/media';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { removeGroupImage, uploadGroupImage } from '@scorely/web/src/modules/groups/groups.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

const PURPOSES = { logo: 'group.logo', cover: 'group.cover' } as const;

/** Linha "Logo e capa" dos Ajustes (GRP-29): as miniaturas e, ao tocar, o painel para enviar, trocar e remover (GRP-35). */
export default defineComponent({
  name: 'GroupImagesCard',

  components: { BottomSheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: {
    saved: () => true,
  },

  data() {
    return {
      open: false,
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
        // GRP-57: sem a permissão, o painel fecha e a página recarrega.
        if (await onPermissionError(err, this.permissionLost)) {
          this.open = false;
          return;
        }
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
        if (await onPermissionError(err, this.permissionLost)) this.open = false;
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = undefined;
      }
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow icon="image" :title="$t('groups.settings.images')" @open="open = true">
      <template v-if="urlOf('logo') || urlOf('cover')">
        <template v-for="slot in slots" :key="slot">
          <img v-if="urlOf(slot)" :src="urlOf(slot)" :alt="$t(`groups.settings.${slot}`)" :class="['thumb', slot]" />
        </template>
      </template>
      <template v-else>{{ $t('groups.settings.summary.noImages') }}</template>
    </SettingsRow>

    <BottomSheet v-model="open" :title="$t('groups.settings.images')">
      <div class="sc-caption hint">{{ $t('groups.settings.imagesHint') }}</div>
      <div class="images">
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
      </div>
      <input ref="input" type="file" accept="image/*" hidden @change="onPicked" />
    </BottomSheet>
  </section>
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

.thumb {
  display: block;
  object-fit: cover;
  border: 1px solid var(--sc-line);
}

.thumb.logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.thumb.cover {
  width: 75px;
  height: 28px;
  border-radius: 4px;
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
