<template>
  <q-page class="q-pa-sm">
    <div class="settings-page q-pa-xs">
      <div class="row q-col-gutter-md">
        <div class="col-12">
          <ProfilePreferences
            :preferences="preferences"
            @update:preferences="preferences = $event"
          />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import ProfilePreferences from 'src/pages/app/profile/profile-page/ProfilePreferences.vue';

export default defineComponent({
  name: 'SettingsPage',

  components: { ProfilePreferences },

  data() {
    return {
      preferences: {
        emailNotifications: true,
        pushNotifications: false,
        publicProfile: true,
      },
    };
  },
});
</script>

<style scoped>
.settings-page {
  max-width: 1024px;
  margin: 0 auto;
}
</style>
