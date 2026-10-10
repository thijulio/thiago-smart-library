<script setup lang="ts">
import type { BookDetail } from '@smart-library/domain';
definePageMeta({ middleware: 'auth' });
const route = useRoute();
const { signOut } = useLibrarySession();
const signOutError = ref('');
const { data, error, status, refresh } = await useFetch<{ book: BookDetail }>(
  () => `/api/private/books/${encodeURIComponent(String(route.params.id))}`,
  { server: false },
);
const book = computed(() => data.value?.book);
watch(error, (value) => {
  if (value?.statusCode === 401 || value?.statusCode === 403) navigateTo('/?signin=required');
});
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
      <NuxtLink to="/library" class="back-link">← My library</NuxtLink>
      <p v-if="signOutError" role="alert">{{ signOutError }}</p>
      <p v-if="status === 'pending'" role="status">Opening your book…</p>
      <div v-else-if="error" class="empty-state" role="alert">
        <h1>{{ error.statusCode === 404 ? 'Book not found' : 'This book couldn’t load' }}</h1>
        <p>
          {{
            error.statusCode === 404
              ? 'This book isn’t available in your library.'
              : 'Please try again in a moment.'
          }}
        </p>
        <button v-if="error.statusCode !== 404" class="primary-button" @click="refresh()">
          Try again
        </button>
      </div>
      <article v-else-if="book" class="book-detail">
        <div class="book-cover detail-cover">
          <img v-if="book.coverUrl" :src="book.coverUrl" alt="" referrerpolicy="no-referrer" /><span
            v-else
            aria-hidden="true"
            >{{ book.title }}</span
          >
        </div>
        <div>
          <p class="eyebrow">{{ book.status }}</p>
          <h1>{{ book.title }}</h1>
          <p class="detail-authors">{{ book.authors.join(', ') }}</p>
          <p v-if="book.seriesName">
            {{ book.seriesName }}{{ book.seriesVolume ? ` · Book ${book.seriesVolume}` : '' }}
          </p>
          <dl class="book-facts">
            <div>
              <dt>Format</dt>
              <dd>{{ book.platform }}</dd>
            </div>
            <div v-if="book.rating !== null">
              <dt>My rating</dt>
              <dd>{{ book.rating }}/5</dd>
            </div>
            <div v-if="book.genres.length">
              <dt>Genres</dt>
              <dd>{{ book.genres.join(', ') }}</dd>
            </div>
            <div v-if="book.wordCount">
              <dt>Word count</dt>
              <dd>{{ book.wordCount.toLocaleString() }}</dd>
            </div>
            <div v-if="book.finishedFrom">
              <dt>Finished</dt>
              <dd>
                {{ book.finishedFrom
                }}{{
                  book.finishedTo && book.finishedTo !== book.finishedFrom
                    ? ` – ${book.finishedTo}`
                    : ''
                }}
              </dd>
            </div>
          </dl>
          <section
            v-for="section in [
              { title: 'My thoughts', text: book.opinion },
              { title: 'Notes', text: book.notes },
              { title: 'Why next', text: book.whyNext },
            ]"
            v-show="section.text"
            :key="section.title"
            class="book-notes"
          >
            <h2>{{ section.title }}</h2>
            <p>{{ section.text }}</p>
          </section>
        </div>
      </article>
    </main>
  </div>
</template>
