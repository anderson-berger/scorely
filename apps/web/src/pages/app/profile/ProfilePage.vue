<template>
  <q-page class="q-pa-sm">
    <div v-if="user && userDraft" class="profile-page q-pa-xs">
      <div class="row q-col-gutter-xs">
        <div class="col-12">
          <ProfilePersonalDataForm
            :user="userDraft"
            :original-user="user"
            :has-changes="hasChanges"
            :avatar-file="avatarFile"
            @update:user="userDraft = $event"
            @update:avatar-file="avatarFile = $event"
            @save="saveUser"
          />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, PropType, toRaw } from 'vue';
import ProfilePersonalDataForm from 'src/pages/app/profile/profile-page/ProfilePersonalDataForm.vue';
import { userStore } from 'src/services/stores/UserStore';
import { User } from '@scorely/api/modules/user/user.schemas';
import UserService from 'src/services/api/UserService';
import FileService from 'src/services/api/FileService';

export default defineComponent({
  name: 'ProfilePage',

  components: { ProfilePersonalDataForm },

  props: {},

  emits: [],

  data() {
    return {
      userDraft: undefined as User | undefined,
      avatarFile: undefined as File | undefined,
    };
  },

  computed: {
    user() {
      return userStore.user;
    },
    hasChanges(): boolean {
      if (!this.user || !this.userDraft) return false;

      if (this.avatarFile) return true;

      return JSON.stringify(this.user) !== JSON.stringify(this.userDraft);
    },
  },

  methods: {
    async saveUser() {
      await this.$load.execute('save-user', async () => {
        if (!this.userDraft) return;

        if (this.avatarFile) {
          const key = await FileService.uploadFile(this.avatarFile);
          this.userDraft.avatar = key;
        }

        if (!this.hasChanges) return;

        await UserService.update(this.userDraft);

        await this.loadUser();
      });
    },
    async loadUser() {
      await this.$load.execute('load-profile-page', async () => {
        await userStore.refreshUser();
        const user = userStore.user;
        if (!user) return;

        this.userDraft = structuredClone(toRaw(user));
        this.avatarFile = undefined;
      });
    },
  },

  async created() {
    await this.loadUser();
  },

  mounted() {},
});
</script>

<style scoped>
.profile-page {
  max-width: 1024px;
  margin: 0 auto;
}
</style>
