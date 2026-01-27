<template>
  <q-page class="q-pa-md">
    <div class="row q-col-gutter-lg">
      <div class="col-12 col-md-4">
        <q-card dark class="card-dark">
          <q-card-section class="text-center">
            <!-- Avatar com upload -->
            <div class="avatar-container q-mb-md">
              <q-avatar size="120px" class="avatar-profile">
                <img :src="user.avatar || defaultAvatar" />
              </q-avatar>
              <q-btn
                round
                dense
                color="primary"
                icon="photo_camera"
                class="avatar-edit-btn"
                @click="changeAvatar"
              >
                <q-tooltip>Alterar foto</q-tooltip>
              </q-btn>
            </div>

            <div class="text-h6">{{ user.name }}</div>
            <div class="text-grey-5">{{ user.email }}</div>

            <q-separator dark class="q-my-md" />

            <div class="text-left">
              <div class="row items-center q-mb-sm">
                <q-icon name="event" size="20px" class="q-mr-sm text-grey-5" />
                <span class="text-grey-4">Membro desde {{ user.createdAt }}</span>
              </div>
              <div class="row items-center">
                <q-icon name="groups" size="20px" class="q-mr-sm text-grey-5" />
                <span class="text-grey-4">{{ user.teamsCount }} times</span>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>

  {{ user }}
</template>

<script lang="ts">
import type { User } from '@scorely/shared/schemas/user';
import UserService from 'src/services/api/UserService';
import UserContext from 'src/services/context/UserContext';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'PerfilPage',

  components: {},

  props: {},

  emits: [],

  data() {
    const user: User = {
      id: '',
      version: 0,
      email: '',
      name: null,
      createdAt: '',
      updatedAt: '',
    };
    return {
      user,
    };
  },

  computed: {},

  methods: {
    async getMe() {
      const user = await this.$load.execute('get-me', async () => {
        return await UserContext.load(true);
      });
      this.user = user;
    },
    async changeAvatar(avatarUrl: string): Promise<User> {
      const response = await UserService.changeAvatar;
      return response.data;
    },
  },

  async created() {},

  async mounted() {
    await this.getMe();
  },
});
</script>

<style scoped>
/* Estilos locais aqui */
</style>
