<template>
  <div class="members-page q-pa-lg">
    <div class="row items-center justify-between q-mb-lg">
      <h4 class="text-white q-mt-none q-mb-none">Membros do Time</h4>
      <q-btn color="primary" icon="person_add" label="Convidar" />
    </div>

    <!-- Filtros -->
    <div class="row q-mb-md q-gutter-sm">
      <q-btn-toggle
        v-model="roleFilter"
        toggle-color="primary"
        :options="[
          { label: 'Todos', value: 'all' },
          { label: 'Admins', value: 'admin' },
          { label: 'Membros', value: 'member' },
        ]"
      />
    </div>

    <q-card dark class="bg-grey-9">
      <q-list separator>
        <q-item v-for="member in filteredMembers" :key="member.id">
          <q-item-section avatar>
            <q-avatar>
              <img :src="member.avatar" />
            </q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-white">{{ member.name }}</q-item-label>
            <q-item-label caption class="text-grey-5">{{ member.email }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-badge :color="getRoleBadgeColor(member.role)">
              {{ getRoleLabel(member.role) }}
            </q-badge>
          </q-item-section>
          <q-item-section side>
            <q-btn flat round icon="more_vert" color="grey-5">
              <q-menu>
                <q-list style="min-width: 150px">
                  <q-item clickable v-close-popup>
                    <q-item-section>Promover</q-item-section>
                  </q-item>
                  <q-item clickable v-close-popup class="text-negative">
                    <q-item-section>Remover</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  avatar: string;
}

export default defineComponent({
  name: 'TeamMembersPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {
      roleFilter: 'all',

      members: [
        { id: '1', name: 'João Silva', email: 'joao@email.com', role: 'owner', avatar: 'https://cdn.quasar.dev/img/avatar.png' },
        { id: '2', name: 'Maria Santos', email: 'maria@email.com', role: 'admin', avatar: 'https://cdn.quasar.dev/img/avatar1.jpg' },
        { id: '3', name: 'Pedro Costa', email: 'pedro@email.com', role: 'member', avatar: 'https://cdn.quasar.dev/img/avatar2.jpg' },
        { id: '4', name: 'Ana Oliveira', email: 'ana@email.com', role: 'member', avatar: 'https://cdn.quasar.dev/img/avatar3.jpg' },
        { id: '5', name: 'Carlos Lima', email: 'carlos@email.com', role: 'admin', avatar: 'https://cdn.quasar.dev/img/avatar4.jpg' },
      ] as Member[],
    };
  },

  computed: {
    filteredMembers(): Member[] {
      if (this.roleFilter === 'all') return this.members;
      return this.members.filter((m) => m.role === this.roleFilter);
    },
  },

  methods: {
    getRoleLabel(role: string): string {
      const labels: Record<string, string> = {
        owner: 'Proprietário',
        admin: 'Admin',
        member: 'Membro',
      };
      return labels[role] || role;
    },

    getRoleBadgeColor(role: string): string {
      const colors: Record<string, string> = {
        owner: 'purple',
        admin: 'blue',
        member: 'grey',
      };
      return colors[role] || 'grey';
    },
  },

  created() {},

  mounted() {},
});
</script>

<style scoped>
.members-page {
  background: #313338;
  min-height: 100vh;
}
</style>
