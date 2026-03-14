<template>
  <div class="settings-page q-pa-lg">
    <h4 class="text-white q-mt-none q-mb-lg">Configurações do Time</h4>

    <!-- Informações básicas -->
    <q-card dark class="bg-grey-9 q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-white q-mb-md">Informações Básicas</div>

        <q-input
          v-model="teamName"
          dark
          filled
          label="Nome do Time"
          class="q-mb-md"
        />

        <q-input
          v-model="teamDescription"
          dark
          filled
          label="Descrição"
          type="textarea"
          class="q-mb-md"
        />

        <div class="row items-center q-gutter-md">
          <q-avatar size="80px">
            <img src="https://cdn.quasar.dev/img/avatar.png" />
          </q-avatar>
          <q-btn color="primary" outline label="Alterar Logo" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Configurações de privacidade -->
    <q-card dark class="bg-grey-9 q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-white q-mb-md">Privacidade</div>

        <q-toggle
          v-model="isPublic"
          dark
          label="Time público (visível para todos)"
          class="q-mb-sm"
        />

        <q-toggle
          v-model="allowInvites"
          dark
          label="Permitir convites de membros"
        />
      </q-card-section>
    </q-card>

    <!-- Zona de perigo -->
    <q-card dark class="bg-grey-9 border-negative">
      <q-card-section>
        <div class="text-subtitle1 text-negative q-mb-md">Zona de Perigo</div>

        <q-btn color="negative" outline label="Transferir Propriedade" class="q-mr-sm" />
        <q-btn color="negative" label="Excluir Time" />
      </q-card-section>
    </q-card>

    <!-- Botão salvar -->
    <div class="row justify-end q-mt-lg">
      <q-btn color="primary" label="Salvar Alterações" size="lg" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'TeamSettingsPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {
      teamName: 'Alpha Team',
      teamDescription: 'Time de esports competitivo',
      isPublic: true,
      allowInvites: true,
    };
  },

  computed: {},

  methods: {},

  created() {},

  mounted() {},
});
</script>

<style scoped>
.settings-page {
  background: #313338;
  min-height: 100vh;
}

.border-negative {
  border: 1px solid var(--q-negative);
}
</style>
