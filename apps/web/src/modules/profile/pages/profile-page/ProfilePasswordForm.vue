<template>
  <q-card>
    <q-card-section>
      <div class="text-subtitle1 q-mb-md">Alterar Senha</div>

      <div class="row q-col-gutter-md">
        <div class="col-12">
          <q-input
            :model-value="form.currentPassword"
            @update:model-value="$emit('update:form', { ...form, currentPassword: $event })"
            filled
            label="Senha atual"
            :type="showCurrentPassword ? 'text' : 'password'"
          >
            <template v-slot:append>
              <q-icon
                :name="showCurrentPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showCurrentPassword = !showCurrentPassword"
              />
            </template>
          </q-input>
        </div>

        <div class="col-12 col-sm-6">
          <q-input
            :model-value="form.newPassword"
            @update:model-value="$emit('update:form', { ...form, newPassword: $event })"
            filled
            label="Nova senha"
            :type="showNewPassword ? 'text' : 'password'"
            :rules="[(v) => !v || v.length >= 8 || 'Mínimo 8 caracteres']"
          >
            <template v-slot:append>
              <q-icon
                :name="showNewPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showNewPassword = !showNewPassword"
              />
            </template>
          </q-input>
        </div>

        <div class="col-12 col-sm-6">
          <q-input
            :model-value="form.confirmPassword"
            @update:model-value="$emit('update:form', { ...form, confirmPassword: $event })"
            filled
            label="Confirmar nova senha"
            :type="showConfirmPassword ? 'text' : 'password'"
            :rules="[(v) => v === form.newPassword || 'Senhas não conferem']"
          >
            <template v-slot:append>
              <q-icon
                :name="showConfirmPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showConfirmPassword = !showConfirmPassword"
              />
            </template>
          </q-input>
        </div>
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          color="primary"
          label="Alterar senha"
          :loading="loading"
          :disable="!canChange"
          @click="$emit('change-password')"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default defineComponent({
  name: 'ProfilePasswordForm',

  props: {
    form: {
      type: Object as PropType<PasswordForm>,
      required: true,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    canChange: {
      type: Boolean,
      default: false,
    },
  },

  emits: ['update:form', 'change-password'],

  data() {
    return {
      showCurrentPassword: false,
      showNewPassword: false,
      showConfirmPassword: false,
    };
  },
});
</script>
