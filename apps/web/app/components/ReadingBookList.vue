<script setup lang="ts">
import type { ReadingBook } from '@smart-library/domain';
defineProps<{ books: ReadingBook[]; label: string; queued?: boolean }>();
const failedCovers = ref(new Set<string>());
</script>
<template>
  <ul class="reading-books" :aria-label="label">
    <li v-for="book in books" :key="book.stableId">
      <NuxtLink :to="`/library/books/${encodeURIComponent(book.stableId)}`" class="reading-book">
        <div class="book-cover reading-cover">
          <img
            v-if="book.coverUrl && !failedCovers.has(book.stableId)"
            :src="book.coverUrl"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="failedCovers.add(book.stableId)"
          />
          <span v-else aria-hidden="true">{{ book.title }}</span>
        </div>
        <div class="reading-book-info">
          <span class="status-label">{{
            queued
              ? `Rank ${book.nextRank}`
              : book.status === 'reread'
                ? 'Rereading'
                : 'Reading now'
          }}</span>
          <h4>{{ book.title }}</h4>
          <p class="book-authors">{{ book.authors.join(', ') }}</p>
          <p v-if="book.seriesName" class="small-copy">
            {{ book.seriesName }}{{ book.seriesVolume ? ` · ${book.seriesVolume}` : '' }}
          </p>
          <p v-if="queued && book.whyNext" class="small-copy reading-reason">{{ book.whyNext }}</p>
        </div>
      </NuxtLink>
    </li>
  </ul>
</template>
<style scoped>
.reading-books {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 1rem;
}
.reading-book {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  gap: 1rem;
  text-decoration: none;
  border-radius: 0.5rem;
}
.reading-cover {
  font-size: 0.8rem;
  padding: 0.35rem;
}
.reading-book-info {
  min-width: 0;
  overflow-wrap: anywhere;
}
h4 {
  margin: 0.35rem 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 500;
}
.reading-book:hover h4 {
  color: var(--brand);
}
.reading-reason {
  white-space: pre-wrap;
}
</style>
