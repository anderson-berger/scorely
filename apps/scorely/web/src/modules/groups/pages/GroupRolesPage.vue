<script lang="ts">
import type { Group, GroupRoleItem, GroupRoles } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { confirmAction } from '@scorely/web/src/lib/confirm';
import { isVersionConflict } from '@scorely/web/src/lib/http';
import GroupRoleSheet from '@scorely/web/src/modules/groups/components/GroupRoleSheet.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { can } from '@scorely/web/src/modules/groups/nav';
import { moveRole } from '@scorely/web/src/modules/groups/roles';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-50: a tela Cargos, a fila dos cargos (Dono, criados, Todos). Criar, abrir, subir, descer e apagar.
 * Só com `roles.manage` (GRV-42): para quem não tem, a rota leva ao Início.
 */
export default defineComponent({
  name: 'GroupRolesPage',

  components: { GroupRoleSheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      list: null as GroupRoles | null,
      error: '',
      sheetOpen: false,
      selected: null as GroupRoleItem | null,
    };
  },

  computed: {
    allowed(): boolean {
      return can(this.group, 'roles.manage');
    },

    roles(): GroupRoleItem[] {
      return this.list?.roles ?? [];
    },
  },

  mounted() {
    if (!this.allowed) {
      this.$router.replace({ name: 'group', params: { id: this.group.id } });
      return;
    }
    this.load();
  },

  methods: {
    async load() {
      this.error = '';
      try {
        this.list = await groupsApi.roles(this.group.id);
      } catch (err) {
        this.error = errorMessage(err);
      }
    },

    label(role: GroupRoleItem): string {
      return role.fixed ? this.$t(`groups.roles.${role.fixed}`) : (role.name ?? '');
    },

    openRole(role: GroupRoleItem | null) {
      this.selected = role;
      this.sheetOpen = true;
    },

    canMove(role: GroupRoleItem, dir: 'up' | 'down'): boolean {
      return moveRole(this.roles, role.id, dir) !== null;
    },

    async move(role: GroupRoleItem, dir: 'up' | 'down') {
      const roleIds = moveRole(this.roles, role.id, dir);
      if (!roleIds || !this.list) return;
      try {
        this.list = await groupsApi.orderRoles(this.group.id, {
          roleIds,
          expectedVersion: this.list.version,
        });
      } catch (err) {
        if (isVersionConflict(err)) {
          this.$q.notify({ type: 'warning', message: this.$t('groups.roles.conflict') });
          await this.load();
        } else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    /** GRV-47: a confirmação diz quantas pessoas voltam para o Todos. */
    async confirmDelete(role: GroupRoleItem) {
      const confirmed = await confirmAction({
        title: this.$t('groups.roles.deleteTitle', { name: this.label(role) }),
        message: this.$t('groups.roles.deleteConfirm', { count: role.members }),
        ok: this.$t('groups.roles.delete'),
        cancel: this.$t('groups.cancel'),
        danger: true,
      });
      if (!confirmed) return;
      await this.remove(role);
    },

    async remove(role: GroupRoleItem) {
      if (!this.list) return;
      try {
        this.list = await groupsApi.deleteRole(this.group.id, role.id, {
          expectedVersion: this.list.version,
        });
        this.$q.notify({ type: 'positive', message: this.$t('groups.roles.deleted') });
      } catch (err) {
        if (isVersionConflict(err)) {
          this.$q.notify({ type: 'warning', message: this.$t('groups.roles.conflict') });
          await this.load();
        } else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },
  },
});
</script>

<template>
  <div v-if="allowed">
    <q-btn
      color="primary"
      unelevated
      no-caps
      icon="add"
      class="sc-btn-main"
      :label="$t('groups.roles.create')"
      :disable="!list"
      @click="openRole(null)"
    />
    <h2 class="sc-section">{{ $t('groups.roles.title') }}</h2>
    <div v-if="error" class="sc-caption error">{{ error }}</div>
    <div v-else-if="!list" class="loading"><q-spinner color="primary" size="md" /></div>
    <ul v-else class="sc-card list">
      <li v-for="r in roles" :key="r.id" class="role">
        <button type="button" class="open" @click="openRole(r)">
          <q-icon v-if="r.fixed === 'owner'" name="lock" size="20px" aria-hidden="true" />
          <span class="info">
            <span class="sc-display">{{ label(r) }}</span>
            <span class="sc-caption">
              <template v-if="r.fixed === 'everyone'">{{ $t('groups.roles.everyoneHint') }} · </template>
              <template v-if="r.fixed === 'owner'">{{ $t('groups.roles.ownerHint') }} · </template>
              {{ $t('groups.roles.summary', { members: r.members, permissions: r.permissions.length }) }}
            </span>
          </span>
        </button>
        <q-btn
          v-if="!r.fixed && r.manageable"
          flat
          round
          dense
          icon="more_vert"
          :aria-label="$t('groups.roles.actions', { name: label(r) })"
        >
          <q-menu>
            <q-list>
              <q-item v-if="canMove(r, 'up')" v-close-popup clickable @click="move(r, 'up')">
                <q-item-section>{{ $t('groups.roles.up') }}</q-item-section>
              </q-item>
              <q-item v-if="canMove(r, 'down')" v-close-popup clickable @click="move(r, 'down')">
                <q-item-section>{{ $t('groups.roles.down') }}</q-item-section>
              </q-item>
              <q-item v-close-popup clickable @click="confirmDelete(r)">
                <q-item-section class="text-negative">{{ $t('groups.roles.delete') }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-btn>
      </li>
    </ul>
    <GroupRoleSheet
      v-model="sheetOpen"
      :group="group"
      :role="selected"
      :version="list?.version ?? 0"
      @saved="list = $event"
    />
  </div>
</template>

<style scoped>
.list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.role {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 64px;
  padding-right: 8px;
  border-bottom: 1px solid var(--sc-line);
}

.role:last-child {
  border-bottom: 0;
}

.open {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-grow: 1;
  min-width: 0;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
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
