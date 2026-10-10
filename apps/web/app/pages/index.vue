<script setup lang="ts">
const busy = ref(false);
const error = ref('');
const route = useRoute();
async function signIn() {
  busy.value = true;
  error.value = '';
  try {
    const result = await $fetch<{ url?: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', callbackURL: '/library', errorCallbackURL: '/?signin=error' },
    });
    if (!result.url) throw new Error();
    window.location.assign(result.url);
  } catch {
    error.value = 'Sign-in is temporarily unavailable. Please try again.';
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-shell">
    <ProductHeader />
    <main id="main" class="landing-main">
      <p class="eyebrow">A home for your reading life</p>
      <h1>Your books.<br /><em>Your next chapter.</em></h1>
      <p class="hero-copy">
        Bring your reading together in a library that belongs to you. See what you’ve read, find
        what’s next, and keep your thoughts close to every book.
      </p>
      <div class="hero-actions">
        <button class="primary-button" :disabled="busy" @click="signIn">
          {{ busy ? 'Connecting…' : 'Continue with Google' }}<span aria-hidden="true"> ↗</span>
        </button>
        <p class="small-copy">Your library is private. Every reader has their own space.</p>
      </div>
      <p v-if="error || route.query.signin === 'error'" role="alert">
        {{ error || 'We couldn’t complete sign-in. Please try again.' }}
      </p>
      <p v-else-if="route.query.signin === 'required'" role="status">
        Sign in to open your library.
      </p>
      <section class="product-features" aria-label="Inside your library">
        <article>
          <span class="feature-number">01</span>
          <h2>Keep your place</h2>
          <p>Read, reading, or waiting for the right moment. Your books, with a little order.</p>
        </article>
        <article>
          <span class="feature-number">02</span>
          <h2>Find your next read</h2>
          <p>A clear view of your library, with search and filters to follow your curiosity.</p>
        </article>
        <article>
          <span class="feature-number">03</span>
          <h2>Make it yours</h2>
          <p>Your notes and impressions stay with your books, inside your account.</p>
        </article>
      </section>
    </main>
    <footer class="site-footer">Smart Library · A personal space for every reader.</footer>
  </div>
</template>
