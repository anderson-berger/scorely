<script lang="ts">
import type { Me } from '@scorely/contracts';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { useNotificationsStore } from '@scorely/web/src/modules/notifications/notifications.store';
import { displayName } from '@scorely/web/src/modules/users/user.display';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-13: a foto da pessoa, que abre a conta (Perfil, Sair). No cabeçalho o menu abre para baixo; na barra lateral,
 * para o lado.
 */
export default defineComponent({
  name: 'AccountMenu',

  props: {
    side: { type: String as PropType<'bottom' | 'right'>, default: 'bottom' },
  },

  setup() {
    return { auth: useAuthStore(), notifications: useNotificationsStore() };
  },

  methods: {
    displayName(user: Me): string {
      return displayName(user);
    },

    initial(s: string): string {
      return s.trim().charAt(0).toUpperCase();
    },

    async logout() {
      this.notifications.reset();
      await this.auth.logout().catch(() => undefined);
      await this.$router.replace({ name: 'login' });
    },
  },
});
</script>

<template>
  <button v-if="auth.user" type="button" class="sc-icon-btn avatar" :aria-label="$t('nav.account')">
    {{ initial(displayName(auth.user)) }}
    <q-tooltip v-if="side === 'right'" anchor="center right" self="center left" :offset="[8, 0]">
      {{ $t('nav.account') }}
    </q-tooltip>
    <q-menu
      :anchor="side === 'right' ? 'top right' : 'bottom right'"
      :self="side === 'right' ? 'top left' : 'top right'"
      :offset="side === 'right' ? [8, 0] : [0, 0]"
    >
      <q-list style="min-width: 220px">
        <q-item>
          <q-item-section>
            <q-item-label>{{ displayName(auth.user) }}</q-item-label>
            <q-item-label caption>{{ auth.user.private.email }}</q-item-label>
          </q-item-section>
        </q-item>
        <q-separator />
        <q-item v-close-popup clickable :to="{ name: 'profile' }">
          <q-item-section avatar><q-icon name="person_outline" /></q-item-section>
          <q-item-section>{{ $t('nav.profile') }}</q-item-section>
        </q-item>
        <q-item v-close-popup clickable @click="logout">
          <q-item-section avatar><q-icon name="logout" /></q-item-section>
          <q-item-section>{{ $t('nav.logout') }}</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </button>
</template>

<style scoped>
.avatar {
  font-family: var(--sc-font-display);
  font-weight: 700;
  font-size: 18px;
  cursor: pointer;
}
</style>
