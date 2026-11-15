<script lang="ts">
import { type Group, PLACE_LIMITS, type Place, type PlaceInput, PlaceInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import {
  addressLine,
  coordsFromLink,
  isShortMapsLink,
  placeSections,
} from '@scorely/web/src/modules/groups/places';
import { defineComponent, type PropType } from 'vue';

/** O form do lugar: o endereço em campos e o ponto que veio do link ou do GPS. */
interface PlaceForm {
  name: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  link: string;
  point: { lat: number; lng: number } | undefined;
}

const EMPTY: PlaceForm = {
  name: '',
  street: '',
  number: '',
  district: '',
  city: '',
  state: '',
  postalCode: '',
  link: '',
  point: undefined,
};

/** O campo opcional só vai se tiver texto. */
const optional = (value: string) => (value.trim() ? value.trim() : undefined);

/**
 * Linha "Lugares" dos Ajustes (GRP-29, 7a): o resumo e, ao tocar, o painel dos lugares (GRP-60–62): o padrão
 * marcado, "Usar como padrão", Editar, Arquivar, "Adicionar lugar" e os arquivados, com Desarquivar.
 */
export default defineComponent({
  name: 'PlacesCard',

  components: { BottomSheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: ['saved'],

  data() {
    return {
      open: false,
      /** `undefined` = a lista; `null` = lugar novo; um lugar = editando. */
      editing: undefined as Place | null | undefined,
      form: { ...EMPTY } as PlaceForm,
      saving: false,
      locating: false,
      places: [] as Place[],
      limits: PLACE_LIMITS,
    };
  },

  computed: {
    sections(): { active: Place[]; archived: Place[] } {
      return placeSections(this.places, this.group.defaultPlaceId);
    },

    /** "Quadra do clube · mais 2", com o padrão primeiro. */
    summary(): string {
      const [first, ...rest] = this.sections.active;
      if (!first) return this.$t('groups.places.none');
      return rest.length > 0
        ? this.$t('groups.places.more', { name: first.name, count: rest.length })
        : first.name;
    },

    sheetTitle(): string {
      if (this.editing === undefined) return this.$t('groups.places.title');
      return this.editing ? this.$t('groups.places.editTitle') : this.$t('groups.places.newTitle');
    },
  },

  mounted() {
    void this.load();
  },

  methods: {
    addressLine,

    /** GRP-63: os lugares do grupo, ativos e arquivados. */
    async load() {
      try {
        this.places = await groupsApi.places(this.group.id);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    startNew() {
      this.form = { ...EMPTY };
      this.editing = null;
    },

    startEdit(place: Place) {
      const a = place.address;
      this.form = {
        name: place.name,
        street: a.street,
        number: a.number ?? '',
        district: a.district ?? '',
        city: a.city,
        state: a.state,
        postalCode: a.postalCode ?? '',
        link: '',
        point: { lat: place.lat, lng: place.lng },
      };
      this.editing = place;
    },

    /** GRP-60: o ponto do link colado; o link curto tem a dica própria. */
    readLink() {
      const text = this.form.link;
      if (!text.trim()) return;
      const point = coordsFromLink(text);
      if (point) {
        this.form.point = point;
        return;
      }
      const message = isShortMapsLink(text)
        ? this.$t('groups.places.shortLink')
        : this.$t('groups.places.badLink');
      this.$q.notify({ type: 'warning', message });
    },

    /** GRP-60: o ponto pelo GPS do aparelho. */
    useLocation() {
      if (!('geolocation' in navigator)) {
        this.$q.notify({ type: 'warning', message: this.$t('groups.places.locationFailed') });
        return;
      }
      this.locating = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.form.point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.locating = false;
        },
        () => {
          this.locating = false;
          this.$q.notify({ type: 'warning', message: this.$t('groups.places.locationFailed') });
        },
        { enableHighAccuracy: true, timeout: 15_000 },
      );
    },

    pointText(): string {
      const p = this.form.point;
      return p ? this.$t('groups.places.pointSet', { lat: p.lat.toFixed(5), lng: p.lng.toFixed(5) }) : '';
    },

    /** Uma ação; conflito ou permissão perdida (GRP-57, ADR 0016) fecham o painel e recarregam a página. */
    async run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
      this.saving = true;
      try {
        await action();
        if (success) this.$q.notify({ type: 'positive', message: success });
        await this.load();
        this.$emit('saved');
        return true;
      } catch (err) {
        if (await onPermissionError(err, this.permissionLost)) this.open = false;
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return false;
      } finally {
        this.saving = false;
      }
    },

    async save() {
      const f = this.form;
      const point = f.point;
      if (!point) {
        this.$q.notify({ type: 'warning', message: this.$t('groups.places.noPoint') });
        return;
      }
      const parsed = PlaceInputSchema.safeParse({
        name: f.name,
        address: {
          street: f.street,
          number: optional(f.number),
          district: optional(f.district),
          city: f.city,
          state: f.state,
          postalCode: optional(f.postalCode),
        },
        lat: point.lat,
        lng: point.lng,
      } satisfies PlaceInput);
      if (!parsed.success) {
        this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
        return;
      }
      const editing = this.editing;
      const ok = await this.run(
        () =>
          editing
            ? groupsApi.updatePlace(this.group.id, editing.id, { ...parsed.data, version: editing.version })
            : groupsApi.createPlace(this.group.id, parsed.data),
        this.$t('groups.places.saved'),
      );
      if (ok) this.editing = undefined;
    },

    /** GRP-62: o padrão vai nos Ajustes, com a versão deles (GRP-59). */
    setDefault(place: Place | null) {
      return this.run(() =>
        groupsApi.update(this.group.id, {
          version: this.group.settingsVersion,
          defaultPlaceId: place ? place.id : null,
        }),
      );
    },

    archive(place: Place) {
      return this.run(() => groupsApi.archivePlace(this.group.id, place.id, { version: place.version }));
    },

    unarchive(place: Place) {
      return this.run(() => groupsApi.unarchivePlace(this.group.id, place.id, { version: place.version }));
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow icon="place" :title="$t('groups.places.title')" :summary="summary" @open="open = true" />

    <BottomSheet v-model="open" :title="sheetTitle" :persistent="saving">
      <template v-if="editing === undefined">
        <div class="sc-caption q-mt-xs">{{ $t('groups.places.hint') }}</div>
        <div v-for="p in sections.active" :key="p.id" class="place">
          <div class="text">
            <div class="sc-display name">
              {{ p.name }}
              <span v-if="p.id === group.defaultPlaceId" class="sc-label tag">{{ $t('groups.places.default') }}</span>
            </div>
            <div class="sc-caption">{{ addressLine(p.address) }}</div>
          </div>
          <q-btn flat round dense icon="more_vert" :aria-label="p.name" :disable="saving">
            <q-menu>
              <q-list>
                <q-item v-if="p.id !== group.defaultPlaceId" v-close-popup clickable @click="setDefault(p)">
                  <q-item-section>{{ $t('groups.places.makeDefault') }}</q-item-section>
                </q-item>
                <q-item v-else v-close-popup clickable @click="setDefault(null)">
                  <q-item-section>{{ $t('groups.places.removeDefault') }}</q-item-section>
                </q-item>
                <q-item v-close-popup clickable @click="startEdit(p)">
                  <q-item-section>{{ $t('groups.places.edit') }}</q-item-section>
                </q-item>
                <q-item v-close-popup clickable @click="archive(p)">
                  <q-item-section>{{ $t('groups.places.archive') }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
        <q-btn flat no-caps icon="add" class="q-mt-sm" :label="$t('groups.places.add')" @click="startNew" />

        <template v-if="sections.archived.length > 0">
          <div class="sc-label archived-title">{{ $t('groups.places.archived') }}</div>
          <div v-for="p in sections.archived" :key="p.id" class="place place--archived">
            <div class="text">
              <div class="sc-display name">{{ p.name }}</div>
              <div class="sc-caption">{{ addressLine(p.address) }}</div>
            </div>
            <q-btn flat no-caps dense :label="$t('groups.places.unarchive')" :disable="saving" @click="unarchive(p)" />
          </div>
        </template>
      </template>

      <template v-else>
        <div class="form">
          <q-input v-model="form.name" outlined dense :label="$t('groups.places.name')" :maxlength="limits.name.max" />
          <q-input v-model="form.street" outlined dense :label="$t('groups.places.street')" :maxlength="limits.street.max" />
          <div class="pair">
            <q-input v-model="form.number" outlined dense :label="$t('groups.places.number')" :maxlength="limits.number.max" />
            <q-input v-model="form.district" outlined dense :label="$t('groups.places.district')" :maxlength="limits.district.max" />
          </div>
          <div class="pair">
            <q-input v-model="form.city" outlined dense :label="$t('groups.places.city')" :maxlength="limits.city.max" />
            <q-input v-model="form.state" outlined dense :label="$t('groups.places.state')" :maxlength="limits.state.max" />
          </div>
          <q-input v-model="form.postalCode" outlined dense :label="$t('groups.places.postalCode')" :maxlength="limits.postalCode.max" />

          <div class="sc-display point-title">{{ $t('groups.places.point') }}</div>
          <div class="sc-caption">{{ $t('groups.places.pointHint') }}</div>
          <q-input
            v-model="form.link"
            outlined
            dense
            :label="$t('groups.places.link')"
            @blur="readLink"
            @keyup.enter="readLink"
          />
          <q-btn
            flat
            no-caps
            icon="my_location"
            :label="$t('groups.places.useLocation')"
            :loading="locating"
            @click="useLocation"
          />
          <div v-if="form.point" class="sc-caption point">{{ pointText() }}</div>
        </div>

        <div class="actions">
          <q-btn
            flat
            no-caps
            class="sc-btn-outline"
            :label="$t('groups.cancel')"
            :disable="saving"
            @click="editing = undefined"
          />
          <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
        </div>
      </template>
    </BottomSheet>
  </section>
</template>

<style scoped>
.place {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.place--archived {
  opacity: 0.7;
}

.text {
  min-width: 0;
}

.name {
  font-size: 18px;
}

.tag {
  margin-left: 6px;
  color: var(--sc-accent);
  font-size: 11px;
}

.archived-title {
  margin-top: 16px;
  color: var(--sc-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.point-title {
  margin-top: 6px;
  font-size: 16px;
}

.point {
  color: var(--sc-accent);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
