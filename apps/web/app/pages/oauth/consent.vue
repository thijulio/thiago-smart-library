<script setup lang="ts">
const route = useRoute();
const busy = ref(false);
const error = ref('');
const clientId = computed(() =>
  typeof route.query.client_id === 'string' ? route.query.client_id : 'Unknown application',
);
const scopes = computed(() =>
  typeof route.query.scope === 'string' ? route.query.scope.split(' ').filter(Boolean) : [],
);
const descriptions: Record<string, string> = {
  'library:read': 'Read your books, reading status and library details.',
  'library:write':
    'Prepare and save supported book changes. Changes needing your approval still require confirmation in Smart Library.',
};
async function consent(accept: boolean) {
  busy.value = true;
  error.value = '';
  try {
    const oauthQuery = window.location.search.slice(1);
    const query = new URLSearchParams(oauthQuery);
    const expected = new URL(query.get('redirect_uri') ?? '');
    if (expected.protocol !== 'https:' || expected.username || expected.password) throw new Error();
    const result = await $fetch<{ url: string }>('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept, oauth_query: oauthQuery },
    });
    const destination = new URL(result.url);
    if (
      destination.origin !== expected.origin ||
      destination.pathname !== expected.pathname ||
      destination.username ||
      destination.password
    )
      throw new Error();
    window.location.assign(destination.href);
  } catch {
    error.value =
      'We could not complete this connection. Sign in again or restart the request in your assistant.';
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-shell">
    <ProductHeader />
    <main id="main" class="landing-main">
      <h1>Allow access to your library?</h1>
      <p>
        Application ID: <strong>{{ clientId }}</strong>
      </p>
      <p>This application requests permission to:</p>
      <ul>
        <li v-for="scope in scopes" :key="scope">
          {{ descriptions[scope] ?? 'Request an unsupported permission.' }}
        </li>
      </ul>
      <p>Only your library is shared. You can end access by signing out of Smart Library.</p>
      <div class="hero-actions">
        <button
          class="primary-button"
          :disabled="busy || !scopes.length || scopes.some((scope) => !descriptions[scope])"
          @click="consent(true)"
        >
          {{ busy ? 'Connecting…' : 'Allow access' }}
        </button>
        <button :disabled="busy" @click="consent(false)">Deny access</button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <p><NuxtLink to="/library">Return to your library</NuxtLink></p>
    </main>
  </div>
</template>
