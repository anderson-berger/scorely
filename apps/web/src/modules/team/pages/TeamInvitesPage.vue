<template>
  <div class="invites-page q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <h4 class="text-white q-mt-none q-mb-none">Convites Pendentes</h4>
      <q-btn color="primary" icon="add" label="Novo Convite" />
    </div>

    <q-card dark class="bg-grey-9">
      <q-list separator>
        <q-item v-for="invite in invites" :key="invite.id">
          <q-item-section avatar>
            <q-icon name="mail_outline" color="grey-5" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-white">{{ invite.email }}</q-item-label>
            <q-item-label caption class="text-grey-5">
              Enviado em {{ invite.sentAt }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge :color="getStatusColor(invite.status)">
              {{ getStatusLabel(invite.status) }}
            </q-badge>
          </q-item-section>
          <q-item-section side>
            <q-btn flat round icon="close" color="negative" size="sm">
              <q-tooltip>Cancelar convite</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

interface Invite {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired';
  sentAt: string;
}

export default defineComponent({
  name: 'TeamInvitesPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {
      invites: [
        { id: '1', email: 'novo@email.com', status: 'pending', sentAt: '25/01/2026' },
        { id: '2', email: 'player@email.com', status: 'pending', sentAt: '24/01/2026' },
        { id: '3', email: 'antigo@email.com', status: 'expired', sentAt: '10/01/2026' },
      ] as Invite[],
    };
  },

  computed: {},

  methods: {
    getStatusColor(status: string): string {
      const colors: Record<string, string> = {
        pending: 'orange',
        accepted: 'green',
        expired: 'grey',
      };
      return colors[status] || 'grey';
    },

    getStatusLabel(status: string): string {
      const labels: Record<string, string> = {
        pending: 'Pendente',
        accepted: 'Aceito',
        expired: 'Expirado',
      };
      return labels[status] || status;
    },
  },

  created() {},

  mounted() {},
});
</script>

<style scoped>
.invites-page {
  background: #313338;
  min-height: 100vh;
}
</style>
