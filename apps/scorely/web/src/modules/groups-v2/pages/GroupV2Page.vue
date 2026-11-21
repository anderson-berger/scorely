<script lang="ts">
import type { GroupV2 } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { groupColor } from '@scorely/web/src/modules/groups/groups';
import { initials } from '@scorely/web/src/modules/groups/scoreboard';
import GroupV2Nav from '@scorely/web/src/modules/groups-v2/components/GroupV2Nav.vue';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { type GroupV2NavItem, groupV2NavItems } from '@scorely/web/src/modules/groups-v2/nav';
import { defineComponent } from 'vue';

/**
 * GRV-13: o casco do grupo, pelo id público (GRV-08). Carrega o grupo, passa para a área (rota filha) e mostra a barra
 * das áreas. Fora do Início, o topo é compacto: o logo pequeno e o nome.
 */
export default defineComponent({
  name: 'GroupV2Page',

  components: { GroupV2Nav },

  data() {
    return {
      group: undefined as GroupV2 | undefined,
      error: '',
    };
  },

  computed: {
    items(): GroupV2NavItem[] {
      return this.group ? groupV2NavItems(this.group) : [];
    },

    /** GRV-13: com uma área só, a barra não aparece. */
    showNav(): boolean {
      return this.items.length >= 2;
    },

    compact(): boolean {
      return this.$route.name !== 'group-v2';
    },

    color(): string {
      return this.group ? `var(--sc-group-${groupColor(this.group.id)})` : '';
    },
  },

  watch: {
    '$route.params.id'() {
      this.load();
    },
  },

  mounted() {
    this.load();
  },

  methods: {
    initials(name: string): string {
      return initials(name);
    },

    async load() {
      const id = this.$route.params.id;
      if (typeof id !== 'string') return;
      this.group = undefined;
      this.error = '';
      try {
        this.group = await groupsV2Api.get(id);
      } catch (err) {
        // GRV-04: quem não participa vê o mesmo "grupo não encontrado" de um código que não existe.
        this.error = errorMessage(err);
      }
    },
  },
});
</script>

<template>
  <q-page>
    <div :class="['sc-page', 'page', { 'with-nav': showNav }]">
      <template v-if="group">
        <GroupV2Nav v-if="showNav" :items="items" :group-id="group.id" />
        <div class="content">
          <div v-if="compact" class="compact" :style="{ '--group-color': color }">
            <div class="sc-display logo" aria-hidden="true">
              <img v-if="group.logoUrl" :src="group.logoUrl" alt="" />
              <template v-else>{{ initials(group.name) }}</template>
            </div>
            <span class="sc-display name">{{ group.name }}</span>
          </div>
          <router-view :group="group" @saved="group = $event" />
        </div>
      </template>
      <div v-else-if="error" class="sc-caption error">{{ error }}</div>
      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
/* A barra fixa embaixo no celular: o fim da página não fica atrás dela. */
.with-nav {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

.content {
  min-width: 0;
}

.compact {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.logo {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 12px;
  background: var(--group-color);
  color: var(--sc-on-accent);
  font-size: 16px;
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

.name {
  font-size: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error {
  padding: 24px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}

/* GRV-13: no PC, a coluna das áreas à esquerda do conteúdo. */
@media (min-width: 1024px) {
  .with-nav {
    display: flex;
    gap: 32px;
    padding-bottom: 40px;
  }

  .content {
    flex: 1;
  }
}
</style>
