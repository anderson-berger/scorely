<script lang="ts">
import { defineComponent } from 'vue';
import BottomSheet from '@/components/BottomSheet.vue';
import { useNotificationsStore } from '../notifications.store';
import NotificationList from './NotificationList.vue';

/** Sino: painel de baixo no celular, menu no resto (plano 008, D10). */
export default defineComponent({
  name: 'NotificationBell',

  components: { BottomSheet, NotificationList },

  setup() {
    return { store: useNotificationsStore() };
  },

  data() {
    return { sheet: false };
  },

  computed: {
    badge(): string {
      return this.store.unreadCount > 99 ? '99+' : String(this.store.unreadCount);
    },
  },

  mounted() {
    this.store.startPolling();
  },

  beforeUnmount() {
    this.store.stopPolling();
  },

  methods: {
    click() {
      if (this.$q.screen.xs) this.sheet = true;
    },
  },
});
</script>

<template>
  <button type="button" class="sc-icon-btn bell" :aria-label="$t('notifications.label')" @click="click">
    <q-icon name="notifications_none" size="22px" />
    <span v-if="store.unreadCount > 0" class="badge">{{ badge }}</span>

    <!-- O menu é teleportado: largura via style inline (CSS scoped não alcança). -->
    <q-menu v-if="!$q.screen.xs" anchor="bottom right" self="top right" style="width: 380px; max-width: calc(100vw - 32px)">
      <div class="menu-head">
        <span class="sc-display menu-title">{{ $t('notifications.title') }}</span>
        <q-btn
          v-if="store.unreadCount > 0"
          flat
          dense
          no-caps
          color="primary"
          :label="$t('notifications.markAllRead')"
          @click="store.markAllRead()"
        />
      </div>
      <NotificationList v-close-popup />
    </q-menu>
  </button>

  <BottomSheet v-model="sheet" :title="$t('notifications.title')">
    <template #action>
      <q-btn
        v-if="store.unreadCount > 0"
        flat
        dense
        no-caps
        color="primary"
        :label="$t('notifications.markAllRead')"
        @click="store.markAllRead()"
      />
    </template>
    <NotificationList class="sheet-list" @opened="sheet = false" />
  </BottomSheet>
</template>

<style scoped>
.bell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--sc-accent);
  color: var(--sc-on-accent);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  box-sizing: border-box;
}

.menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 8px 16px;
}

.menu-title {
  font-size: 24px;
}

.sheet-list {
  margin: 8px -16px 0;
}
</style>
