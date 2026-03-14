<!-- ProfilePersonalDataForm.vue -->
<template>
  <q-card>
    <q-form @submit.prevent="onSave">
      <q-card-section>
        <div class="text-subtitle1 q-mb-sm">Dados Pessoais</div>
        <div class="text-caption" :class="{ 'text-info': hasChanges }">
          {{ hasChanges ? 'Possui alterações' : '\u00A0' }}
        </div>
      </q-card-section>

      <q-card-section>
        <div class="row q-col-gutter-md">
          <div class="col-12 col-sm-auto">
            <div class="column items-center">
              <AvatarUpload
                :avatar="localUser.avatar"
                :preview-file="avatarFile"
                @update:file="updateAvatarFile"
              />
              <div class="text-body2 q-mt-sm">{{ localUser.email }}</div>
              <div class="text-caption text-page-secondary">
                Membro desde {{ formatDate(localUser.createdAt) }}
              </div>
            </div>
          </div>

          <div class="col-12 col-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-md-12">
                <q-input
                  :model-value="localUser.name"
                  @update:model-value="(v) => updateField('name', v)"
                  filled
                  dense
                  label="Nome"
                />
              </div>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn :disable="!hasChanges" color="primary" label="Salvar alterações" type="submit" />
      </q-card-actions>
    </q-form>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { User } from '@scorely/api/modules/user/user.schemas';
import AvatarUpload from 'src/components/utils/AvatarUpload.vue';

export default defineComponent({
  name: 'ProfilePersonalDataForm',

  components: { AvatarUpload },

  props: {
    user: {
      type: Object as PropType<User>,
      required: true,
    },
    originalUser: {
      type: Object as PropType<User>,
      required: true,
    },
    hasChanges: {
      type: Boolean,
      default: false,
    },
    avatarFile: {
      type: File as PropType<File | undefined>,
      default: undefined,
    },
  },

  emits: ['update:user', 'update:avatar-file', 'save'],

  computed: {
    localUser(): User {
      return this.user;
    },
  },

  methods: {
    updateField<K extends keyof User>(field: K, value: string | number | null) {
      const sanitizedValue = value === null || value === '' ? undefined : String(value).trim();
      const updated = { ...this.localUser, [field]: sanitizedValue };
      this.$emit('update:user', updated);
    },

    updateAvatarFile(file: File | undefined) {
      this.$emit('update:avatar-file', file);
    },

    formatDate(dateString?: string): string {
      if (!dateString) return '-';
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
    },

    onSave() {
      this.$emit('save');
    },
  },
});
</script>

<style scoped>
.text-page-secondary {
  color: var(--page-text-secondary);
}
</style>
