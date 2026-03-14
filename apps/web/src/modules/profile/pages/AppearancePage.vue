<template>
  <q-page class="q-pa-sm">
    <div class="appearance-page q-pa-xs">
      <div class="row q-col-gutter-md">
        <div class="col-12">
          <q-card>
            <q-card-section>
              <div class="text-subtitle1 q-mb-md">Aparência</div>

              <q-list>
                <q-item tag="label">
                  <q-item-section>
                    <q-item-label>Tema escuro</q-item-label>
                    <q-item-label caption> Alternar entre tema claro e escuro </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle
                      :model-value="isDarkMode"
                      @update:model-value="toggleDarkMode"
                      color="primary"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'AppearancePage',

  computed: {
    isDarkMode(): boolean {
      return this.$q.dark.isActive;
    },
  },

  methods: {
    toggleDarkMode(value: boolean) {
      this.$q.dark.set(value);
    },
  },
});
</script>

<style scoped>
.appearance-page {
  max-width: 1024px;
  margin: 0 auto;
}
</style>
