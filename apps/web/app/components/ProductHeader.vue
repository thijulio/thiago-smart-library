<script setup lang="ts">
const props = defineProps<{ signedIn?: boolean }>();
const emit = defineEmits<{ signout: [] }>();
const mode = ref<'light' | 'dark'>('light');
useHead(() => ({ htmlAttrs: { 'data-mode': mode.value } }));
onMounted(() => {
  try {
    mode.value = localStorage.getItem('smart-library-mode') === 'dark' ? 'dark' : 'light';
  } catch {
    /* Storage may be disabled. */
  }
});
function toggleTheme() {
  mode.value = mode.value === 'light' ? 'dark' : 'light';
  try {
    localStorage.setItem('smart-library-mode', mode.value);
  } catch {
    /* Theme still works without persistence. */
  }
}
</script>
<template>
  <header class="site-header">
    <NuxtLink :to="props.signedIn ? '/library' : '/'" class="brand-link"
      >Smart Library<span class="brand-dot" aria-hidden="true">.</span></NuxtLink
    >
    <nav aria-label="Main navigation">
      <button
        class="quiet-button"
        :aria-label="`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`"
        @click="toggleTheme"
      >
        {{ mode === 'light' ? 'Dark mode' : 'Light mode' }}
      </button>
      <button v-if="props.signedIn" class="quiet-button" @click="emit('signout')">Sign out</button>
    </nav>
  </header>
</template>
