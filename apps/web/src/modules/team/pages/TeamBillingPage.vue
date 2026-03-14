<template>
  <div class="billing-page q-pa-lg">
    <h4 class="text-white q-mt-none q-mb-lg">Faturamento</h4>

    <!-- Plano atual -->
    <q-card dark class="bg-grey-9 q-mb-md">
      <q-card-section>
        <div class="row items-center justify-between">
          <div>
            <div class="text-caption text-grey-5">Plano Atual</div>
            <div class="text-h5 text-white">Gratuito</div>
          </div>
          <q-btn color="primary" label="Fazer Upgrade" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Recursos do plano -->
    <q-card dark class="bg-grey-9 q-mb-md">
      <q-card-section>
        <div class="text-subtitle1 text-white q-mb-md">Recursos do Plano</div>

        <q-list>
          <q-item v-for="feature in features" :key="feature.name">
            <q-item-section avatar>
              <q-icon
                :name="feature.included ? 'check_circle' : 'cancel'"
                :color="feature.included ? 'green' : 'grey-6'"
              />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-white">{{ feature.name }}</q-item-label>
              <q-item-label caption class="text-grey-5">{{ feature.description }}</q-item-label>
            </q-item-section>
            <q-item-section side>
              <span class="text-grey-4">{{ feature.limit }}</span>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>

    <!-- Histórico de pagamentos -->
    <q-card dark class="bg-grey-9">
      <q-card-section>
        <div class="text-subtitle1 text-white q-mb-md">Histórico de Pagamentos</div>

        <div class="text-center text-grey-5 q-pa-lg">
          <q-icon name="receipt_long" size="48px" class="q-mb-sm" />
          <p>Nenhum pagamento registrado</p>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

interface Feature {
  name: string;
  description: string;
  limit: string;
  included: boolean;
}

export default defineComponent({
  name: 'TeamBillingPage',

  components: {},

  props: {},

  emits: [],

  data() {
    return {
      features: [
        { name: 'Membros', description: 'Quantidade de membros no time', limit: '10', included: true },
        { name: 'Campeonatos', description: 'Participação em campeonatos', limit: '3/mês', included: true },
        { name: 'Armazenamento', description: 'Para logos e mídia', limit: '100MB', included: true },
        { name: 'Analytics', description: 'Estatísticas avançadas', limit: '-', included: false },
        { name: 'Suporte prioritário', description: 'Atendimento rápido', limit: '-', included: false },
      ] as Feature[],
    };
  },

  computed: {},

  methods: {},

  created() {},

  mounted() {},
});
</script>

<style scoped>
.billing-page {
  background: #313338;
  min-height: 100vh;
}
</style>
