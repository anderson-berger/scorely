<template>
  <div v-if="user" class="perfil-page q-pa-xs">
    <div class="row q-col-gutter-xs">
      <div class="col-12">
        <ProfilePersonalDataForm :item="user" @handler-file="onFile" @save="saveUser" />
      </div>
      {{ user }}
      <!-- <div class="col-12">
        <ProfilePasswordForm
          :form="passwordForm"
          :loading="changingPassword"
          :can-change="canChangePassword"
          @update:form="passwordForm = $event"
          @change-password="changePassword"
        />
      </div>

      <div class="col-12">
        <ProfilePreferences
          :preferences="preferences"
          @update:preferences="preferences = $event"
          @toggle-dark-mode="toggleDarkMode"
        />
      </div>

      <div class="col-12">
        <ProfileDangerZone
          @export-data="exportData"
          @confirm-delete-account="confirmDeleteAccount"
        />
      </div> -->
    </div>

    <!-- <DeleteAccountDialog
      :show="showDeleteDialog"
      :confirmation="deleteConfirmation"
      @update:show="showDeleteDialog = $event"
      @update:confirmation="deleteConfirmation = $event"
      @cancel="showDeleteDialog = false"
      @confirm="deleteAccount"
    />  -->
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

//components
import ProfilePersonalDataForm from 'src/pages/app/perfil/perfil-page/ProfilePersonalDataForm.vue';
//services
import UserContext from 'src/services/context/UserContext';
//types
import FileService from 'src/services/api/FileService';
import UserService from 'src/services/api/UserService';
import type { User } from '@scorely/shared/schemas/user/user_schemas';

export default defineComponent({
  name: 'PerfilPage',

  components: { ProfilePersonalDataForm },

  props: {},

  emits: [],

  data() {
    return {
      avatarFile: undefined as undefined | File,
      user: undefined as User | undefined,
      userSnapshot: '',
    };
  },

  computed: {
    userHasChanges() {
      if (this.avatarFile) return true;
      return this.userSnapshot === JSON.stringify(this.user);
    },
  },

  methods: {
    onFile(file: File) {
      this.avatarFile = file;
      // lógica aqui
    },
    async saveUser() {
      await this.$load.execute('save-user', async () => {
        if (!this.user) return;
        if (this.avatarFile) {
          const key = await FileService.uploadFile(this.avatarFile);
          this.user.avatar = key;
        }

        if (!this.userHasChanges) return;

        await UserService.update(this.user);
        await this.syncUser();
      });
    },

    async uploadFile() {
      if (!this.user || !this.avatarFile) return;
      const url = await FileService.uploadFile(this.avatarFile);
      this.user.avatar = url;
    },

    async syncUser() {
      await this.$load.execute('sync-user', async () => {
        await UserContext.load(true);
        this.user = UserContext.get();
        this.userSnapshot = JSON.stringify(this.user);
      });
    },
  },

  async created() {
    await this.syncUser();
  },

  mounted() {},
});
</script>

<style scoped>
/* Estilos locais aqui */
</style>
