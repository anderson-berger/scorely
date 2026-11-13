<script lang="ts">
import type { Group, InviteKind } from '@scorely/contracts';
import { inviteUrl } from '@scorely/web/src/modules/groups/links';
import { copyToClipboard } from 'quasar';
import { defineComponent, type PropType } from 'vue';

interface LinkRow {
  kind: InviteKind;
  label: string;
  url: string;
}

/**
 * Os links do dono (plano 007, D5/D7) em linhas compactas (plano 015, D12): membro, reserva e, com convidados ligados,
 * o do jogo, cada um com Copiar e "Gerar outro link". Ficam só no "Convidar" da aba Membros (GRP-29).
 */
export default defineComponent({
  name: 'GroupLinksCard',

  props: {
    group: { type: Object as PropType<Group>, required: true },
    busy: { type: Boolean, default: false },
  },

  emits: ['rotate'],

  computed: {
    rows(): LinkRow[] {
      const origin = window.location.origin;
      const url = (kind: InviteKind, token: string | undefined) =>
        token ? inviteUrl(origin, kind, token) : '';
      const rows: LinkRow[] = [
        { kind: 'member', label: this.$t('groups.linkMember'), url: url('member', this.group.inviteToken) },
        {
          kind: 'reserve',
          label: this.$t('groups.linkReserve'),
          url: url('reserve', this.group.reserveInviteToken),
        },
      ];
      if (this.group.guestsOpenHoursBefore === undefined) return rows;
      return [
        ...rows,
        { kind: 'guest', label: this.$t('groups.linkGuest'), url: url('guest', this.group.guestToken) },
      ];
    },
  },

  methods: {
    async copy(url: string) {
      await copyToClipboard(url);
      this.$q.notify({ type: 'positive', message: this.$t('groups.copied') });
    },
  },
});
</script>

<template>
  <div>
    <div class="sc-caption hint">{{ $t('groups.linksHint') }}</div>
    <div class="sc-card rows">
      <div v-for="row in rows" :key="row.kind" class="row">
        <div class="text">
          <div class="sc-display label">{{ row.label }}</div>
          <div class="sc-caption">{{ row.url ? $t(`groups.linkBadge.${row.kind}`) : $t('groups.linkMissing') }}</div>
        </div>

        <template v-if="row.url">
          <q-btn
            flat
            round
            icon="autorenew"
            class="rotate"
            :aria-label="`${$t('groups.rotate')}: ${row.label}`"
            :disable="busy"
            @click="$emit('rotate', row.kind)"
          >
            <q-tooltip>{{ $t('groups.rotate') }}</q-tooltip>
          </q-btn>
          <q-btn color="primary" unelevated no-caps class="copy" :label="$t('groups.copy')" @click="copy(row.url)" />
        </template>
        <q-btn
          v-else
          flat
          no-caps
          color="primary"
          icon="add_link"
          class="generate"
          :label="$t('groups.generate')"
          :disable="busy"
          @click="$emit('rotate', row.kind)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hint {
  margin: 0 0 10px;
}

.rows {
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--sc-line);
}

.row:last-child {
  border-bottom: 0;
}

.text {
  flex-grow: 1;
  min-width: 0;
}

.label {
  font-size: 18px;
}

.rotate {
  color: var(--sc-text-2);
}

.copy {
  min-height: 44px;
  border-radius: 10px;
  font-weight: 700;
}

.generate {
  min-height: 44px;
  border: 1px dashed var(--sc-accent);
  border-radius: 10px;
}
</style>
