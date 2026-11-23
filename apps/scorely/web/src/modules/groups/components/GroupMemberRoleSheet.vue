<script lang="ts">
import type { Group, GroupMember, GroupRoleItem } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { roleChoices } from '@scorely/web/src/modules/groups/roles';
import { defineComponent, type PropType } from 'vue';

/** GRV-32, 48: "Mudar cargo": os cargos abaixo do meu e o Todos, com o atual marcado. */
export default defineComponent({
  name: 'GroupMemberRoleSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    group: { type: Object as PropType<Group>, required: true },
    member: { type: Object as PropType<GroupMember | null>, default: null },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    /** O cargo mudou: a lista relê. */
    changed: () => true,
  },

  data() {
    return { choices: [] as GroupRoleItem[], current: '', loading: false, saving: false };
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.load();
    },
  },

  methods: {
    async load() {
      this.current = this.member?.role.id ?? '';
      this.choices = [];
      this.loading = true;
      try {
        this.choices = roleChoices((await groupsApi.roles(this.group.id)).roles);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        this.close();
      } finally {
        this.loading = false;
      }
    },

    label(role: GroupRoleItem): string {
      return role.fixed ? this.$t(`groups.roles.${role.fixed}`) : (role.name ?? '');
    },

    close() {
      this.$emit('update:modelValue', false);
    },

    async pick(role: GroupRoleItem) {
      if (!this.member || role.id === this.current || role.id === 'owner') return;
      this.saving = true;
      try {
        await groupsApi.setMemberRole(this.group.id, this.member.user.id, {
          roleId: role.id,
        });
        this.$q.notify({
          type: 'positive',
          message: this.$t('groups.roles.changed', { name: this.member.user.nickname }),
        });
        this.$emit('changed');
        this.close();
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
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
    :title="$t('groups.roles.changeTitle', { name: member?.user.nickname ?? '' })"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="loading" class="loading"><q-spinner color="primary" size="md" /></div>
    <q-list v-else class="options">
      <q-item
        v-for="r in choices"
        :key="r.id"
        v-ripple
        clickable
        :disable="saving"
        class="option"
        @click="pick(r)"
      >
        <q-item-section avatar>
          <q-radio :model-value="current" :val="r.id" disable />
        </q-item-section>
        <q-item-section>
          <q-item-label class="name">{{ label(r) }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
  </BottomSheet>
</template>

<style scoped>
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

.loading {
  padding: 24px 0;
  text-align: center;
}
</style>
