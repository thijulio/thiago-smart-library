export function useLibrarySession() {
  const user = useState<{ id: string; name: string } | null>('library-user', () => null);
  async function refresh() {
    try {
      user.value = (
        await $fetch<{ user: { id: string; name: string } }>('/api/private/session')
      ).user;
    } catch {
      user.value = null;
    }
    return user.value;
  }
  async function signOut() {
    await $fetch('/api/auth/sign-out', { method: 'POST', body: {} });
    user.value = null;
    clearNuxtData();
    await navigateTo('/');
  }
  return { user, refresh, signOut };
}
