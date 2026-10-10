import { defineEventHandler, setResponseHeader } from 'h3';
export default defineEventHandler((event) => {
  if (/^\/(?:api\/(?:private|auth)(?:\/|$)|library(?:\/|$))/.test(event.path)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0');
    setResponseHeader(event, 'Vary', 'Cookie');
  }
});
