<template>
  <q-card dark class="card-dark q-mb-md">
    <q-card-section>
      <div class="text-subtitle1 q-mb-md">Preferências</div>

      <q-list>
        <q-item tag="label">
          <q-item-section>
            <q-item-label>Notificações por e-mail</q-item-label>
            <q-item-label caption class="text-grey-5">
              Receber atualizações de times e campeonatos
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="preferences.emailNotifications"
              @update:model-value="
                $emit('update:preferences', { ...preferences, emailNotifications: $event })
              "
              color="primary"
            />
          </q-item-section>
        </q-item>

        <q-item tag="label">
          <q-item-section>
            <q-item-label>Notificações push</q-item-label>
            <q-item-label caption class="text-grey-5">
              Receber notificações no navegador
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="preferences.pushNotifications"
              @update:model-value="
                $emit('update:preferences', { ...preferences, pushNotifications: $event })
              "
              color="primary"
            />
          </q-item-section>
        </q-item>

        <q-item tag="label">
          <q-item-section>
            <q-item-label>Perfil público</q-item-label>
            <q-item-label caption class="text-grey-5">
              Permitir que outros usuários vejam seu perfil
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="preferences.publicProfile"
              @update:model-value="
                $emit('update:preferences', { ...preferences, publicProfile: $event })
              "
              color="primary"
            />
          </q-item-section>
        </q-item>

        <q-item tag="label">
          <q-item-section>
            <q-item-label>Tema escuro</q-item-label>
            <q-item-label caption class="text-grey-5"> Usar tema escuro na interface </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              :model-value="preferences.darkMode"
              @update:model-value="handleDarkModeToggle"
              color="primary"
            />
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue';

interface Preferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  publicProfile: boolean;
  darkMode: boolean;
}

export default defineComponent({
  name: 'ProfilePreferences',

  props: {
    preferences: {
      type: Object as PropType<Preferences>,
      required: true,
    },
  },

  emits: ['update:preferences', 'toggle-dark-mode'],

  methods: {
    handleDarkModeToggle(value: boolean) {
      this.$emit('update:preferences', { ...this.preferences, darkMode: value });
      this.$emit('toggle-dark-mode', value);
    },
  },
});
</script>

<style scoped>
.card-dark {
  background: #2b2d31;
}
</style>
