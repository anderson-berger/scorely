<template>
  <div class="row full-height">
    <!-- LEFT -->
    <div :class="isMobile ? 'col-12' : 'col-6'" class="q-pa-md">
      <q-tabs v-model="tab" dense active-color="primary" indicator-color="primary">
        <q-tab name="owner" label="Meus campeonatos" />
        <q-tab name="admin" label="Organizo" />
        <q-tab name="member" label="Participo" />
      </q-tabs>

      <q-separator />

      <q-tab-panels v-model="tab" animated>
        <!-- OWNER -->
        <q-tab-panel name="owner">
          <ChampionshipCard
            v-for="championship in myChampionships"
            :key="championship.id"
            :championship="championship"
            role="owner"
            class="q-mb-sm"
            @select="selectChampionship"
            @edit="setAction('edit', championship)"
            @manage="setAction('manage', championship)"
            @delete="deleteChampionship"
          />
        </q-tab-panel>

        <!-- ADMIN -->
        <q-tab-panel name="admin">
          <ChampionshipCard
            v-for="championship in managedChampionships"
            :key="championship.id"
            :championship="championship"
            role="admin"
            class="q-mb-sm"
            @select="selectChampionship"
            @manage="setAction('manage', championship)"
          />
        </q-tab-panel>

        <!-- MEMBER -->
        <q-tab-panel name="member">
          <ChampionshipCard
            v-for="championship in memberChampionships"
            :key="championship.id"
            :championship="championship"
            role="member"
            class="q-mb-sm"
            @select="selectChampionship"
            @leave="leaveChampionship"
          />
        </q-tab-panel>
      </q-tab-panels>

      <!-- CREATE BUTTON -->
      <div class="row justify-end q-mt-md">
        <q-btn color="primary" icon="add" label="Criar campeonato" @click="createChampionship" />
      </div>
    </div>

    <!-- RIGHT -->
    <div v-if="!isMobile" class="col-6 q-pa-md">
      <ChampionshipActionPanel :championship="selectedChampionship" :action="currentAction" />
    </div>
  </div>

  <!-- MOBILE ACTION DIALOG -->
  <q-dialog v-model="showActionDialog" position="bottom" full-width>
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-sm">
        <div class="text-weight-medium">
          {{ selectedChampionship?.name || 'Novo campeonato' }}
        </div>
        <q-btn flat round icon="close" v-close-popup />
      </div>

      <ChampionshipActionPanel :championship="selectedChampionship" :action="currentAction" />
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ChampionshipCard from './championship-page/ChampionshipCard.vue';
import ChampionshipActionPanel from './championship-page/ChampionshipActionPanel.vue';
import type { Championship } from 'src/services/api/ChampionshipService';

export default defineComponent({
  name: 'ChampionshipPage',

  components: {
    ChampionshipCard,
    ChampionshipActionPanel,
  },

  data() {
    return {
      tab: 'owner',
      showActionDialog: false,

      selectedChampionship: null as Championship | null,
      currentAction: null as 'create' | 'edit' | 'manage' | null,

      myChampionships: [
        {
          id: 1,
          name: 'Liga Alpha',
          description: 'Campeonato competitivo',
          sport: 'Futebol',
          status: 'draft',
        },
      ] as Championship[],

      managedChampionships: [
        {
          id: 2,
          name: 'Copa Regional',
          description: 'Times convidados',
          sport: 'Basquete',
          status: 'open',
        },
      ] as Championship[],

      memberChampionships: [
        {
          id: 3,
          name: 'Torneio de Verão',
          description: 'Fase de grupos',
          sport: 'Vôlei',
          status: 'running',
        },
      ] as Championship[],
    };
  },

  computed: {
    isMobile(): boolean {
      return this.$q.screen.lt.md;
    },
  },

  methods: {
    createChampionship() {
      this.selectedChampionship = null;
      this.currentAction = 'create';

      if (this.isMobile) {
        this.showActionDialog = true;
      }
    },

    selectChampionship(championship: Championship) {
      this.selectedChampionship = championship;
      this.currentAction = null;

      if (this.isMobile) {
        this.showActionDialog = true;
      }
    },

    setAction(action: 'edit' | 'manage', championship: Championship) {
      this.selectedChampionship = championship;
      this.currentAction = action;

      if (this.isMobile) {
        this.showActionDialog = true;
      }
    },

    deleteChampionship(championship: Championship) {
      console.log('delete', championship);
    },

    leaveChampionship(championship: Championship) {
      console.log('leave', championship);
    },
  },
});
</script>
