<template>
  <div class="row full-height">
    <!-- LEFT -->
    <div :class="isMobile ? 'col-12' : 'col-6'" class="q-pa-md">
      <q-tabs v-model="tab" dense active-color="primary" indicator-color="primary">
        <q-tab name="owner" label="Meus times" />
        <q-tab name="admin" label="Gerencio" />
        <q-tab name="member" label="Participo" />
      </q-tabs>
      <div class="row justify-end q-my-sm">
        <q-btn color="primary" icon="add" label="Criar time" @click="createTeam" />
      </div>
      <q-separator />

      <q-tab-panels v-model="tab" animated>
        <q-tab-panel name="owner">
          <TeamCard
            v-for="team in myTeams"
            :key="team.id"
            :team="team"
            role="owner"
            class="q-mb-sm"
            @select="selectTeam"
            @edit="setAction('edit', team)"
            @manage="setAction('manage', team)"
            @delete="deleteTeam"
          />
        </q-tab-panel>

        <q-tab-panel name="admin">
          <TeamCard
            v-for="team in managedTeams"
            :key="team.id"
            :team="team"
            role="admin"
            class="q-mb-sm"
            @select="selectTeam"
            @manage="setAction('manage', team)"
          />
        </q-tab-panel>

        <q-tab-panel name="member">
          <TeamCard
            v-for="team in memberTeams"
            :key="team.id"
            :team="team"
            role="member"
            class="q-mb-sm"
            @select="selectTeam"
            @leave="leaveTeam"
          />
        </q-tab-panel>
      </q-tab-panels>
    </div>

    <!-- RIGHT -->
    <div v-if="!isMobile" class="col-6 q-pa-md">
      <TeamActionPanel :team="selectedTeam" :action="currentAction" />
    </div>
  </div>
  <q-dialog v-model="showActionDialog" position="bottom" full-width>
    <q-card class="q-pa-md">
      <div class="row items-center justify-between q-mb-sm">
        <div class="text-weight-medium">
          {{ selectedTeam?.name }}
        </div>
        <q-btn flat round icon="close" v-close-popup />
      </div>

      <TeamActionPanel :team="selectedTeam" :action="currentAction" />
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import TeamCard from './team-page/TeamCard.vue';
import TeamActionPanel from './team-page/TeamActionPanel.vue';

export default defineComponent({
  name: 'TeamPage',

  components: { TeamCard, TeamActionPanel },

  data() {
    return {
      showActionDialog: false,
      tab: 'owner',
      selectedTeam: null as any,
      currentAction: null as 'create' | 'edit' | 'manage' | null,

      myTeams: [
        {
          id: 1,
          name: 'Dragons FC',
          description: 'Time competitivo',
          avatar: 'https://i.pravatar.cc/100?img=12',
        },
        {
          id: 1,
          name: 'Dragons FC',
          description: 'Time competitivo',
          avatar: 'https://i.pravatar.cc/100?img=12',
        },
        {
          id: 1,
          name: 'Dragons FC',
          description: 'Time competitivo',
          avatar: 'https://i.pravatar.cc/100?img=12',
        },
        {
          id: 1,
          name: 'Dragons FC',
          description: 'Time competitivo',
          avatar: 'https://i.pravatar.cc/100?img=12',
        },
        {
          id: 1,
          name: 'Dragons FC',
          description: 'Time competitivo',
          avatar: 'https://i.pravatar.cc/100?img=12',
        },
      ],
      managedTeams: [
        {
          id: 2,
          name: 'Eagles',
          description: 'Equipe regional',
          avatar: 'https://i.pravatar.cc/100?img=32',
        },
      ],
      memberTeams: [
        {
          id: 3,
          name: 'Sharks',
          description: 'Treinos semanais',
          avatar: 'https://i.pravatar.cc/100?img=45',
        },
      ],
    };
  },
  computed: {
    isMobile(): boolean {
      return this.$q.screen.lt.md;
    },
  },
  methods: {
    createTeam() {
      this.selectedTeam = { name: 'Novo time' }; // placeholder visual
      this.currentAction = 'create';

      if (this.isMobile) {
        this.showActionDialog = true;
      }
    },

    selectTeam(team: any) {
      this.selectedTeam = team;
      this.currentAction = null;

      if (this.isMobile) {
        this.showActionDialog = true;
      }
    },

    setAction(action: 'edit' | 'manage', team: any) {
      this.selectedTeam = team;
      this.currentAction = action;

      if (this.isMobile) {
        this.showActionDialog = true;
      }
    },
  },
});
</script>
