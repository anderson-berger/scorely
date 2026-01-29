<template>
  <q-card dark class="card-dark border-negative">
    <q-card-section>
      <div class="text-subtitle1 text-negative q-mb-md">Zona de Perigo</div>

      <div class="row items-center justify-between q-mb-md">
        <div>
          <div class="text-body1">Exportar dados</div>
          <div class="text-caption text-grey-5">Baixe uma cópia de todos os seus dados</div>
        </div>
        <q-btn
          outline
          color="primary"
          label="Exportar"
          icon="download"
          @click="$emit('export-data')"
        />
      </div>

      <q-separator dark class="q-my-md" />

      <div class="row items-center justify-between">
        <div>
          <div class="text-body1">Excluir conta</div>
          <div class="text-caption text-grey-5">
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
.card-dark {
  background: #2b2d31;
}

.border-negative {
  border: 1px solid var(--q-negative);
}
</style>
