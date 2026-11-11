<script setup lang="ts">
import { groupReadingBooks, isReadingResponse } from '@smart-library/domain';
definePageMeta({ middleware: 'auth' });
const { signOut } = useLibrarySession();
const signOutError = ref('');
const { data, status, error, refresh } = await useFetch<unknown>('/api/private/reading', {
  server: false,
  lazy: true,
  key: 'private-reading',
});
const valid = computed(() => isReadingResponse(data.value));
const groups = computed(() =>
  !error.value && status.value === 'success' && isReadingResponse(data.value)
    ? groupReadingBooks(data.value.books)
    : { current: [], queue: [] },
);
watch(
  error,
  (value) => {
    if (value?.statusCode === 401 || value?.statusCode === 403) {
      clearNuxtData('private-reading');
      navigateTo('/?signin=required');
    }
  },
  { immediate: true },
);
async function logout() {
  try {
    await signOut();
  } catch {
    signOutError.value = 'Couldn’t sign out. Please try again.';
  }
}
</script>
<template>
  <div class="page-shell">
    <ProductHeader signed-in @signout="logout" />
    <main class="library-main">
      <div class="library-heading">
        <div>
          <p class="eyebrow">Your reading space</p>
          <h1>Reading</h1>
          <p class="small-copy">What you’re reading and what you’ve chosen next.</p>
        </div>
      </div>
      <p v-if="signOutError" role="alert">{{ signOutError }}</p>
      <p v-if="status === 'pending' || status === 'idle'" class="empty-state" role="status">
        Opening your reading…
      </p>
      <div v-else-if="error" class="empty-state" role="alert">
        <h2>Your reading couldn’t load</h2>
        <p>Please try again in a moment.</p>
        <button class="primary-button" @click="refresh()">Try again</button>
      </div>
      <div v-else-if="!valid" class="empty-state" role="alert">
        <h2>Reading data unavailable</h2>
        <p>We couldn’t confirm your reading choices. Please try again.</p>
        <button class="primary-button" @click="refresh()">Try again</button>
      </div>
      <template v-else>
        <section aria-labelledby="reading-now" class="reading-section">
          <h2 id="reading-now">Reading now</h2>
          <p v-if="!groups.current.length" class="empty-state">No books currently in progress.</p>
          <div v-else class="reading-groups">
            <section v-for="group in groups.current" :key="group.label" class="reading-group">
              <h3>{{ group.label }}</h3>
              <ReadingBookList :books="group.books" :label="`${group.label} current reading`" />
            </section>
          </div>
        </section>
        <section aria-labelledby="up-next" class="reading-section">
          <h2 id="up-next">Up Next</h2>
          <p class="small-copy">Your recorded choices, in their recorded order.</p>
          <p v-if="!groups.queue.length" class="empty-state">No Up Next choices recorded yet.</p>
          <div v-else class="reading-groups">
            <section v-for="group in groups.queue" :key="group.label" class="reading-group">
              <h3>{{ group.label }}</h3>
              <p v-if="group.hasTies" class="small-copy">
                Some books share a rank; their relative order is not recorded.
              </p>
              <ReadingBookList :books="group.books" :label="`${group.label} Up Next`" queued />
            </section>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>
<style scoped>
.reading-section + .reading-section {
  margin-top: 3rem;
}
.reading-section > h2 {
  font-size: 2rem;
  margin-bottom: 1rem;
}
.reading-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
  gap: 1.5rem;
  align-items: start;
}
.reading-group {
  min-width: 0;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.75rem;
}
.reading-group h3 {
  margin-top: 0;
  font-weight: 500;
}
</style>
