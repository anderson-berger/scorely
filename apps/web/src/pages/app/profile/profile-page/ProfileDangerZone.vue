<template>
  <q-card class="border-negative">
    <q-card-section>
      <div class="text-subtitle1 text-negative q-mb-md">Zona de Perigo</div>

      <div class="row items-center justify-between q-mb-md">
        <div>
          <div class="text-body1">Exportar dados</div>
          <div class="text-caption text-page-secondary">Baixe uma cópia de todos os seus dados</div>
        </div>
        <q-btn
          outline
          color="primary"
          label="Exportar"
          icon="download"
          @click="$emit('export-data')"
        />
      </div>

      <q-separator class="q-my-md" />

      <div class="row items-center justify-between">
        <div>
          <div class="text-body1">Excluir conta</div>
          <div class="text-caption text-page-secondary">
            Esta ação é irreversível. Todos os seus dados serão perdidos.
          </div>
        </div>
        <q-btn
          color="negative"
          label="Excluir conta"
          icon="delete_forever"
          @click="$emit('confirm-delete-account')"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ProfileDangerZone',

  emits: ['export-data', 'confirm-delete-account'],
});
</script>

<style scoped>
.border-negative {
  border: 1px solid var(--q-negative);
}

.text-page-secondary {
  color: var(--page-text-secondary);
}
</style>
