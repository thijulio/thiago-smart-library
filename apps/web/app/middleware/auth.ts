export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return;
  const { refresh } = useLibrarySession();
  if (!(await refresh())) return navigateTo('/?signin=required');
});
