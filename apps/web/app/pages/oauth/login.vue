<script setup lang="ts">
const busy = ref(false);
const error = ref('');
async function signIn() {
  busy.value = true;
  error.value = '';
  try {
    const oauthQuery = window.location.search.slice(1);
    if (!oauthQuery) throw new Error();
    const result = await $fetch<{ url?: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider: 'google', oauth_query: oauthQuery },
    });
    const destination = new URL(result.url ?? '');
    if (destination.origin !== 'https://accounts.google.com') throw new Error();
    window.location.assign(destination.href);
  } catch {
    error.value = 'This connection request is invalid or expired. Start again in your assistant.';
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-shell">
    <ProductHeader />
    <main id="main" class="landing-main">
      <h1>Connect your library</h1>
      <p>Sign in to choose whether this assistant can access your Smart Library.</p>
      <p>Your Google account is used only to sign in.</p>
      <button class="primary-button" :disabled="busy" @click="signIn">
        {{ busy ? 'Connecting…' : 'Continue with Google' }}
      </button>
      <p v-if="error" role="alert">{{ error }}</p>
      <p><NuxtLink to="/">Return to Smart Library</NuxtLink></p>
    </main>
  </div>
</template>
