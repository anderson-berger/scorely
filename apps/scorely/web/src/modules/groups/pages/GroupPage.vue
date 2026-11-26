<script lang="ts">
import type { Group, GroupPreview } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import GroupCover from '@scorely/web/src/modules/groups/components/GroupCover.vue';
import GroupNav from '@scorely/web/src/modules/groups/components/GroupNav.vue';
import GroupRequestCard from '@scorely/web/src/modules/groups/components/GroupRequestCard.vue';
import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { type GroupNavItem, groupNavItems } from '@scorely/web/src/modules/groups/nav';
import { defineComponent } from 'vue';

/**
 * GRV-13: o casco do grupo, pelo id público (GRV-08). Carrega o grupo, mostra o topo e as abas das áreas e passa o
 * grupo para a área (rota filha). No Início, o topo é a capa, o logo e o nome em destaque (GRV-07); nas outras áreas, é
 * compacto: o logo pequeno e o nome. Quem é de fora de um grupo aberto vê a apresentação com o pedido (GRV-39).
 */
export default defineComponent({
  name: 'GroupPage',

  components: { GroupCover, GroupNav, GroupRequestCard },

  data() {
    return {
      group: undefined as Group | undefined,
      preview: undefined as GroupPreview | undefined,
      error: '',
    };
  },

  computed: {
    items(): GroupNavItem[] {
      return this.group ? groupNavItems(this.group) : [];
    },

    compact(): boolean {
      return this.$route.name !== 'group';
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
      this.preview = undefined;
      this.error = '';
      try {
        this.group = await groupsApi.get(id);
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'GROUP_NOT_FOUND') {
          await this.loadPreview(id, err);
          return;
        }
        this.error = errorMessage(err);
      }
    },

    /**
     * GRV-39: quem não participa tenta a apresentação do grupo aberto (GRV-26). No grupo de convite, ou num código
     * que não existe, fica o mesmo "grupo não encontrado" (GRV-04).
     */
    async loadPreview(id: string, notFound: unknown) {
      try {
        this.preview = await groupsApi.preview(id);
      } catch {
        this.error = errorMessage(notFound);
      }
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page">
      <template v-if="group">
        <div v-if="compact" class="compact" :style="{ '--group-color': color }">
          <div class="sc-display logo" aria-hidden="true">
            <img v-if="group.logoUrl" :src="group.logoUrl" alt="" />
            <template v-else>{{ initials(group.name) }}</template>
          </div>
          <span class="sc-display name">{{ group.name }}</span>
        </div>
        <div v-else class="hero">
          <GroupCover :group="group" large />
          <h1 class="sc-title">{{ group.name }}</h1>
        </div>
        <GroupNav :items="items" :group="group" />
        <router-view :group="group" @saved="group = $event" />
      </template>
      <GroupRequestCard v-else-if="preview" :preview="preview" @changed="preview = $event" @open="load" />
      <div v-else-if="error" class="sc-caption error">{{ error }}</div>
      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.hero {
  margin-bottom: 16px;
}

.compact {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
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
</style>
