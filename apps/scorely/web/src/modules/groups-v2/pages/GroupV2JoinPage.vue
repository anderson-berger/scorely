<script lang="ts">
import type { GroupInvitePreviewV2, GroupV2 } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import { groupColor } from '@scorely/web/src/modules/groups/groups';
import { initials } from '@scorely/web/src/modules/groups/scoreboard';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { defineComponent } from 'vue';

/**
 * GRV-35: a página do convite (`/v2/join/:token`). Mostra a apresentação do grupo (GRV-21) e o botão de entrar.
 * Sem login, o guard leva ao login e volta para cá. Convite que não vale mostra o motivo.
 */
export default defineComponent({
  name: 'GroupV2JoinPage',

  data() {
    return {
      preview: undefined as GroupInvitePreviewV2 | undefined,
      /** A mensagem do convite que não vale (GRV-21) ou de outro erro. */
      error: '',
      joining: false,
    };
  },

  computed: {
    token(): string {
      return String(this.$route.params.token ?? '');
    },

    color(): string {
      return this.preview ? `var(--sc-group-${groupColor(this.preview.groupId)})` : '';
    },

    /** Quem já participa e não subiria vê "Abrir o grupo"; a reserva com convite de membro, "Virar membro". */
    action(): 'join' | 'open' | 'promote' {
      const p = this.preview;
      if (!p?.myTier) return 'join';
      return p.myTier === 'reserve' && p.tier === 'member' ? 'promote' : 'open';
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
      try {
        this.preview = await groupsV2Api.previewInvite(this.token);
      } catch (err) {
        this.error = this.reasonMessage(err);
      }
    },

    /** GRV-21: o motivo do convite inválido (venceu, esgotou, cancelado, não existe, é para outra pessoa). */
    reasonMessage(err: unknown): string {
      if (err instanceof ApiRequestError && err.code === 'GROUP_INVITE_INVALID') {
        const reason = (err.details as { reason?: string } | undefined)?.reason ?? 'not_found';
        return this.$t(`groupsV2.join.invalid.${reason}`);
      }
      return errorMessage(err);
    },

    async join() {
      if (!this.preview) return;
      if (this.action === 'open') {
        await this.$router.replace({ name: 'group-v2', params: { id: this.preview.groupId } });
        return;
      }
      this.joining = true;
      try {
        const group: GroupV2 = await groupsV2Api.joinInvite(this.token);
        await this.$router.replace({ name: 'group-v2', params: { id: group.id } });
      } catch (err) {
        this.$q.notify({ type: 'negative', message: this.reasonMessage(err) });
      } finally {
        this.joining = false;
      }
    },
  },
});
</script>

<template>
  <q-page>
    <div class="sc-page page">
      <div v-if="preview" class="invite" :style="{ '--group-color': color }">
        <div class="cover" :style="preview.coverUrl ? { backgroundImage: `url('${preview.coverUrl}')` } : {}" aria-hidden="true" />
        <div class="sc-display logo" aria-hidden="true">
          <img v-if="preview.logoUrl" :src="preview.logoUrl" alt="" />
          <template v-else>{{ initials(preview.name) }}</template>
        </div>
        <h1 class="sc-title">{{ preview.name }}</h1>
        <div class="sc-caption">{{ $t('groupsV2.join.participants', { count: preview.participants }) }}</div>
        <div class="sc-caption">{{ $t(`groupsV2.join.as.${preview.tier}`) }}</div>
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main cta"
          :label="$t(`groupsV2.join.${action}`)"
          :loading="joining"
          @click="join"
        />
      </div>
      <div v-else-if="error" class="sc-caption error">{{ error }}</div>
      <div v-else class="loading"><q-spinner color="primary" size="md" /></div>
    </div>
  </q-page>
</template>

<style scoped>
.invite {
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

.cta {
  margin-top: 16px;
  min-width: 200px;
}

.error {
  padding: 48px 0;
  text-align: center;
}

.loading {
  margin-top: 48px;
  text-align: center;
}
</style>
