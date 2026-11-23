<script lang="ts">
import type { Group, GroupPermission, GroupRoleItem, GroupRoles } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { isVersionConflict } from '@scorely/web/src/lib/http';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { rolePanelPermissions, roleTemplate } from '@scorely/web/src/modules/groups/roles';
import { defineComponent, type PropType } from 'vue';

/**
 * GRV-51: o painel do cargo. Ao criar, começa pela escolha do modelo (Admin ou Do zero), que só preenche o painel.
 * Sem `manageable` (cargo acima do meu), abre só para ver.
 */
export default defineComponent({
  name: 'GroupRoleSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    group: { type: Object as PropType<Group>, required: true },
    /** O cargo aberto; `null` cria um novo. */
    role: { type: Object as PropType<GroupRoleItem | null>, default: null },
    /** A `version` da lista, que toda edição manda de volta (GRV-44). */
    version: { type: Number, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    /** A lista como ficou (ou relida, depois de um conflito de versão). */
    saved: (_roles: GroupRoles) => true,
  },

  data() {
    return {
      step: 'form' as 'template' | 'form',
      name: '',
      selected: [] as GroupPermission[],
      saving: false,
    };
  },

  computed: {
    creating(): boolean {
      return this.role === null;
    },

    readonly(): boolean {
      return this.role !== null && !this.role.manageable;
    },

    isEveryone(): boolean {
      return this.role?.fixed === 'everyone';
    },

    rows(): { permission: GroupPermission; on: boolean; locked: boolean }[] {
      return rolePanelPermissions(this.role, this.group.myPermissions).map((row) => ({
        ...row,
        on: this.selected.includes(row.permission),
      }));
    },

    title(): string {
      if (this.creating) return this.$t('groups.roles.newTitle');
      if (this.role?.fixed) return this.$t(`groups.roles.${this.role.fixed}`);
      return this.role?.name ?? this.$t('groups.roles.editTitle');
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.reset();
    },
  },

  methods: {
    reset() {
      this.step = this.creating ? 'template' : 'form';
      this.name = this.role?.name ?? '';
      this.selected = [...(this.role?.permissions ?? [])];
    },

    /** GRV-51: o modelo só preenche o painel; o nome vem sugerido e se edita. */
    pick(template: 'admin' | 'scratch') {
      this.selected = roleTemplate(template, this.group.myPermissions);
      this.name = template === 'admin' ? this.$t('groups.roles.suggestedName') : '';
      this.step = 'form';
    },

    toggle(permission: GroupPermission, on: boolean) {
      this.selected = on ? [...this.selected, permission] : this.selected.filter((p) => p !== permission);
    },

    close() {
      this.$emit('update:modelValue', false);
    },

    async save() {
      this.saving = true;
      try {
        // GRV-45: o cargo mantém as permissões travadas do jeito que estão; o painel só liga e desliga as outras.
        // No Todos o nome não existe e a api o ignora (GRV-45), mas o contrato exige um: vai o nome de exibição.
        const name = this.isEveryone ? this.$t('groups.roles.everyone') : this.name.trim();
        const input = { name, permissions: this.selected, expectedVersion: this.version };
        const roles = this.role
          ? await groupsApi.updateRole(this.group.id, this.role.id, input)
          : await groupsApi.createRole(this.group.id, input);
        this.$q.notify({ type: 'positive', message: this.$t('groups.roles.saved') });
        this.$emit('saved', roles);
        this.close();
      } catch (err) {
        if (isVersionConflict(err)) {
          // ADR 0016: a lista mudou desde a leitura: relê, fecha o painel e avisa.
          this.$q.notify({ type: 'warning', message: this.$t('groups.roles.conflict') });
          this.close();
          try {
            this.$emit('saved', await groupsApi.roles(this.group.id));
          } catch (reloadErr) {
            this.$q.notify({ type: 'negative', message: errorMessage(reloadErr) });
          }
        } else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="title"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="step === 'template'">
      <div class="sc-caption hint">{{ $t('groups.roles.templateHint') }}</div>
      <q-list class="options">
        <q-item v-for="t in ['admin', 'scratch'] as const" :key="t" v-ripple clickable class="option" @click="pick(t)">
          <q-item-section>
            <q-item-label class="name">{{ $t(`groups.roles.template${t === 'admin' ? 'Admin' : 'Scratch'}`) }}</q-item-label>
            <q-item-label caption>
              {{ $t(`groups.roles.template${t === 'admin' ? 'Admin' : 'Scratch'}Hint`) }}
            </q-item-label>
          </q-item-section>
          <q-item-section side><q-icon name="chevron_right" /></q-item-section>
        </q-item>
      </q-list>
    </template>
    <template v-else>
      <div v-if="readonly" class="sc-caption hint">
        {{ role?.fixed === 'owner' ? $t('groups.roles.ownerHint') : $t('groups.roles.viewOnly') }}
      </div>
      <q-input
        v-if="!role?.fixed"
        v-model="name"
        :label="$t('groups.roles.name')"
        :readonly="readonly"
        :disable="saving"
        maxlength="30"
        outlined
        class="field"
      />
      <q-list class="options">
        <q-item v-for="row in rows" :key="row.permission" tag="label" class="option">
          <q-item-section>
            <q-item-label class="name">{{ $t(`groups.permissions.${row.permission}.name`) }}</q-item-label>
            <q-item-label caption>{{ $t(`groups.permissions.${row.permission}.hint`) }}</q-item-label>
            <q-item-label v-if="row.locked && !readonly" caption>{{ $t('groups.roles.locked') }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="row.on"
              :disable="saving || readonly || row.locked"
              @update:model-value="toggle(row.permission, $event)"
            />
          </q-item-section>
        </q-item>
      </q-list>
      <div class="footer">
        <q-btn flat no-caps :label="$t('groups.cancel')" :disable="saving" @click="close" />
        <q-btn
          v-if="!readonly"
          color="primary"
          unelevated
          no-caps
          :label="$t('groups.roles.save')"
          :loading="saving"
          :disable="!isEveryone && name.trim() === ''"
          @click="save"
        />
      </div>
    </template>
  </BottomSheet>
</template>

<style scoped>
.hint {
  margin: 4px 0 8px;
}

.field {
  margin-top: 8px;
}

.options {
  padding: 8px 0;
}

.option {
  padding-left: 0;
  padding-right: 0;
}

.name {
  font-weight: 700;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}
</style>
