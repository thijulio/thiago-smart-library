<script setup lang="ts">
import type { BookCard } from '@smart-library/domain';
definePageMeta({ middleware: 'auth' });
const { user, signOut } = useLibrarySession();
const query = ref('');
const status = ref('all');
const signOutError = ref('');
const {
  data,
  status: loading,
  error,
  refresh,
} = await useFetch<{ books: BookCard[] }>('/api/private/books', {
  server: false,
  key: 'private-library',
});
const books = computed(() => data.value?.books ?? []);
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return books.value.filter(
    (book) =>
      (status.value === 'all' || book.status === status.value) &&
      (!needle ||
        [book.title, ...book.authors, book.seriesName ?? ''].some((text) =>
          text.toLocaleLowerCase().includes(needle),
        )),
  );
});
async function logout() {
  try {
    await signOut();
  } catch {
    signOutError.value = 'Couldn’t sign out. Please try again.';
  }
}
watch(error, (value) => {
  if (value?.statusCode === 401 || value?.statusCode === 403) navigateTo('/?signin=required');
});
function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
</script>
<template>
  <div class="page-shell">
    <ProductHeader signed-in @signout="logout" />
    <main class="library-main">
      <div class="library-heading">
        <div>
          <p class="eyebrow">
            {{ user?.name ? `${user.name}’s reading space` : 'Your reading space' }}
          </p>
          <h1>My library</h1>
        </div>
        <p v-if="!error && loading !== 'pending'" class="library-count">
          {{ books.length }} {{ books.length === 1 ? 'book' : 'books' }}
        </p>
      </div>
      <p v-if="signOutError" role="alert">{{ signOutError }}</p>
      <div v-if="books.length" class="library-controls">
        <div>
          <label for="book-search">Search your library</label
          ><input
            id="book-search"
            v-model="query"
            type="search"
            placeholder="Title, author, or series"
          />
        </div>
        <div>
          <label for="book-status">Reading status</label
          ><select id="book-status" v-model="status">
            <option value="all">All books</option>
            <option
              v-for="value in [
                'reading',
                'read',
                'unread',
                'wishlist',
                'reread',
                'paused',
                'abandoned',
              ]"
              :key="value"
              :value="value"
            >
              {{ label(value) }}
            </option>
          </select>
        </div>
      </div>
      <p v-if="loading === 'pending'" role="status" class="empty-state">Opening your library…</p>
      <div v-else-if="error" class="empty-state" role="alert">
        <h2>Your library couldn’t load</h2>
        <p>Please try again in a moment.</p>
        <button class="primary-button" @click="refresh()">Try again</button>
      </div>
      <div v-else-if="!books.length" class="empty-state">
        <p class="eyebrow">A fresh start</p>
        <h2>Your library starts here</h2>
        <p>You don’t have any books in your library yet.</p>
      </div>
      <div v-else-if="!filtered.length" class="empty-state" role="status">
        <h2>No books match</h2>
        <p>Try another search or reading status.</p>
      </div>
      <ul v-else class="book-grid" aria-label="Your books">
        <li v-for="book in filtered" :key="book.stableId" class="book-card">
          <NuxtLink :to="`/library/books/${encodeURIComponent(book.stableId)}`" class="book-link">
            <div class="book-cover">
              <img
                v-if="book.coverUrl"
                :src="book.coverUrl"
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
                @error="($event.target as HTMLImageElement).hidden = true"
              /><span v-else aria-hidden="true">{{ book.title }}</span>
            </div>
            <div class="book-info">
              <span class="status-label">{{ label(book.status) }}</span>
              <h2>{{ book.title }}</h2>
              <p class="book-authors">{{ book.authors.join(', ') }}</p>
              <p v-if="book.seriesName" class="small-copy">
                {{ book.seriesName }}{{ book.seriesVolume ? ` · ${book.seriesVolume}` : '' }}
              </p>
              <p class="book-meta">
                {{ book.platform }}<span v-if="book.rating !== null"> · {{ book.rating }}/5</span>
              </p>
            </div>
          </NuxtLink>
        </li>
      </ul>
    </main>
  </div>
</template>
