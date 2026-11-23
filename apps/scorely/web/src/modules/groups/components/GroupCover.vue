<script lang="ts">
import type { Group } from '@scorely/contracts';
import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-06, 07, 11: a capa do grupo com o logo sobreposto na borda de baixo. Sem imagem, a cor fixa do id público
 * e as iniciais do nome.
 */
export default defineComponent({
  name: 'GroupCover',

  props: {
    group: { type: Object as PropType<Group>, required: true },
    /** A página do grupo usa o tamanho grande; o card da lista, o pequeno. */
    large: { type: Boolean, default: false },
  },

  computed: {
    color(): string {
      return `var(--sc-group-${groupColor(this.group.id)})`;
    },

    initials(): string {
      return initials(this.group.name);
    },

    coverStyle(): Record<string, string> {
      return this.group.coverUrl ? { backgroundImage: `url("${this.group.coverUrl}")` } : {};
    },
  },
});
</script>

<template>
  <div :class="['cover-wrap', { large }]" :style="{ '--group-color': color }">
    <div class="cover" :style="coverStyle" aria-hidden="true" />
    <div class="sc-display logo" aria-hidden="true">
      <img v-if="group.logoUrl" :src="group.logoUrl" alt="" />
      <template v-else>{{ initials }}</template>
    </div>
  </div>
</template>

<style scoped>
.cover-wrap {
  position: relative;
  margin-bottom: 28px;
}

.cover {
  aspect-ratio: 8 / 3;
  background: var(--group-color);
  background-size: cover;
  background-position: center;
}

.logo {
  position: absolute;
  left: 16px;
  bottom: -28px;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 16px;
  border: 3px solid var(--sc-bg);
  background: var(--group-color);
  color: var(--sc-on-accent);
  font-size: 22px;
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

.large .logo {
  width: 80px;
  height: 80px;
  bottom: -40px;
  font-size: 30px;
}

.large {
  margin-bottom: 44px;
}
</style>
