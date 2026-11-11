<script setup lang="ts">
import { onUnmounted } from 'vue';
import type { ChangeProposal, ChangeReceipt } from '@smart-library/domain';
definePageMeta({ middleware: 'auth' });
const route = useRoute();
const id = String(route.params.id);
const { data, status, error, refresh } = await useFetch<{ proposal: ChangeProposal }>(
  `/api/private/changes/${encodeURIComponent(id)}`,
  { server: false, key: `private-change-${id}` },
);
const proposal = computed(() => data.value?.proposal);
const receipt = ref<ChangeReceipt | null>(null);
const saving = ref(false);
const saveError = ref('');
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  clock = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (clock) clearInterval(clock);
});
const expired = computed(
  () =>
    !!proposal.value &&
    (proposal.value.state === 'expired' || Date.parse(proposal.value.expiresAt) <= now.value),
);
const saved = computed(() => receipt.value ?? proposal.value?.receipt);
const labels: Record<string, string> = {
  title: 'Title',
  authors: 'Authors',
  platform: 'Format',
  status: 'Reading status',
  rating: 'Rating',
  opinion: 'Opinion',
  notes: 'Notes',
  finishedDate: 'Finished date',
};
const rows = computed(() => {
  const p = proposal.value;
  if (!p) return [];
  const values = p.change.type === 'create' ? p.change : p.change.patch;
  return Object.keys(labels)
    .filter((key) => Object.hasOwn(values, key))
    .map((key) => ({
      key,
      label: labels[key],
      before: p.before ? (p.before as unknown as Record<string, unknown>)[key] : null,
      after: (values as unknown as Record<string, unknown>)[key],
    }));
});
function display(value: unknown) {
  if (value === null || value === undefined) return 'None';
  if (value === '') return '(empty text)';
  if (Array.isArray(value)) return value.join('\n');
  return String(value);
}
async function approve() {
  const p = proposal.value;
  if (!p || expired.value || saving.value || saved.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    // Retain only the retry identifier; never cache proposal contents in browser storage.
    const key = `library-change-request:${p.id}`;
    let requestId = sessionStorage.getItem(key);
    if (!requestId) {
      requestId = crypto.randomUUID();
      sessionStorage.setItem(key, requestId);
    }
    const result = await $fetch<{ receipt: ChangeReceipt }>(
      `/api/private/changes/${encodeURIComponent(p.id)}/confirm`,
      {
        method: 'POST',
        body: { requestId, digest: p.digest },
      },
    );
    receipt.value = result.receipt;
  } catch {
    saveError.value =
      'This change could not be saved. You can retry, or refresh to check its status. If the book changed, prepare a new proposal.';
  } finally {
    saving.value = false;
  }
}
watch(error, (value) => {
  if (value?.statusCode === 401 || value?.statusCode === 403) navigateTo('/?signin=required');
});
</script>
<template>
  <div class="page-shell">
    <main class="library-main review-main">
      <NuxtLink to="/library">Back to your library</NuxtLink>
      <h1>Review library change</h1>
      <p v-if="status === 'pending'" role="status">Loading your proposal…</p>
      <div v-else-if="error" role="alert">
        <p>This proposal could not be opened. It may be unavailable to your account.</p>
        <button class="primary-button" @click="refresh()">Try again</button>
      </div>
      <template v-else-if="proposal">
        <div v-if="saved" role="status">
          <h2>{{ saved.changed ? 'Change saved' : 'Library already matches' }}</h2>
          <p>Verified receipt: {{ saved.appliedAt }}</p>
          <NuxtLink :to="`/library/books/${encodeURIComponent(saved.stableId)}`"
            >Open book</NuxtLink
          >
        </div>
        <template v-else>
          <h2>
            {{
              proposal.change.type === 'create'
                ? 'Add a book'
                : (proposal.before?.title ?? 'Update book')
            }}
          </h2>
          <p>Review the exact values below. Approval saves this proposal to your library.</p>
          <p v-if="proposal.change.type === 'update'">Fields not listed stay unchanged.</p>
          <table>
            <caption>
              Proposed book values
            </caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Current value</th>
                <th scope="col">After approval</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.key">
                <th scope="row">{{ row.label }}</th>
                <td>{{ display(row.before) }}</td>
                <td>{{ display(row.after) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-if="expired" role="alert">
            This proposal has expired. Prepare a new change to continue.
          </p>
          <p v-else>Approval expires at {{ proposal.expiresAt }}.</p>
          <p v-if="saveError" role="alert">{{ saveError }}</p>
          <div class="review-actions">
            <button class="primary-button" :disabled="expired || saving" @click="approve">
              {{ saving ? 'Saving…' : 'Approve and save' }}
            </button>
            <NuxtLink to="/library">Cancel</NuxtLink>
            <button v-if="saveError" :disabled="saving" @click="refresh()">Refresh status</button>
          </div>
        </template>
      </template>
    </main>
  </div>
</template>
<style scoped>
.review-main {
  max-width: 70rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-block: 1.5rem;
}
caption {
  text-align: left;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
th,
td {
  text-align: left;
  vertical-align: top;
  padding: 0.75rem;
  border-bottom: 1px solid currentColor;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.review-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
button:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
