<script lang="ts">
import type { GroupPreview } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-39: a apresentação do grupo aberto para quem é de fora (GRV-26), com Pedir para entrar ou, com o pedido
 * esperando, "Pedido enviado" e Cancelar pedido (GRV-27).
 */
export default defineComponent({
  name: 'GroupRequestCard',

  props: {
    preview: { type: Object as PropType<GroupPreview>, required: true },
  },

  emits: {
    /** A apresentação como ficou depois de pedir ou cancelar. */
    changed: (_preview: GroupPreview) => true,
    /** A pessoa já participa (entrou enquanto a tela estava aberta): o casco relê o grupo. */
    open: () => true,
  },

  data() {
    return {
      busy: false,
    };
  },

  computed: {
    color(): string {
      return `var(--sc-group-${groupColor(this.preview.groupId)})`;
    },
  },

  methods: {
    initials(name: string): string {
      return initials(name);
    },

    date(iso: string): string {
      return formatDateTime(iso, 'date');
    },

    async ask() {
      this.busy = true;
      try {
        this.$emit('changed', await groupsApi.request(this.preview.groupId));
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = false;
      }
    },

    async cancel() {
      this.busy = true;
      try {
        await groupsApi.cancelRequest(this.preview.groupId);
        this.$q.notify({ type: 'positive', message: this.$t('groups.preview.cancelled') });
        const { requestedAt: _, ...rest } = this.preview;
        this.$emit('changed', rest);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>

<template>
  <div class="preview" :style="{ '--group-color': color }">
    <div class="cover" :style="preview.coverUrl ? { backgroundImage: `url('${preview.coverUrl}')` } : {}" aria-hidden="true" />
    <div class="sc-display logo" aria-hidden="true">
      <img v-if="preview.logoUrl" :src="preview.logoUrl" alt="" />
      <template v-else>{{ initials(preview.name) }}</template>
    </div>
    <h1 class="sc-title">{{ preview.name }}</h1>
    <div class="sc-caption">{{ $t('groups.preview.participants', { count: preview.participants }) }}</div>
    <q-btn
      v-if="preview.myTier"
      color="primary"
      unelevated
      no-caps
      class="sc-btn-main cta"
      :label="$t('groups.preview.open')"
      @click="$emit('open')"
    />
    <template v-else-if="preview.requestedAt">
      <div class="requested">{{ $t('groups.preview.requested', { date: date(preview.requestedAt) }) }}</div>
      <div class="sc-caption">{{ $t('groups.preview.requestedHint') }}</div>
      <q-btn
        flat
        no-caps
        color="negative"
        class="cta"
        :label="$t('groups.preview.cancel')"
        :loading="busy"
        @click="cancel"
      />
    </template>
    <q-btn
      v-else
      color="primary"
      unelevated
      no-caps
      class="sc-btn-main cta"
      :label="$t('groups.preview.request')"
      :loading="busy"
      @click="ask"
    />
  </div>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.cover {
  width: 100%;
  aspect-ratio: 1600 / 600;
  border-radius: 12px;
  background: var(--group-color) center / cover;
}

.logo {
  width: 72px;
  height: 72px;
  margin-top: -40px;
  overflow: hidden;
  border-radius: 18px;
  border: 3px solid var(--sc-bg);
  background: var(--group-color);
  color: var(--sc-on-accent);
  font-size: 28px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.requested {
  margin-top: 12px;
  font-weight: 700;
}

.cta {
  margin-top: 16px;
  min-width: 200px;
}
</style>
