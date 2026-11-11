import { defineEventHandler, setResponseHeader } from 'h3';
export default defineEventHandler((event) => {
  if (/^\/oauth(?:\/|$)/.test(event.path)) {
    setResponseHeader(event, 'Cache-Control', 'private, no-store, max-age=0');
    setResponseHeader(event, 'Referrer-Policy', 'no-referrer');
    setResponseHeader(event, 'Vary', 'Cookie');
  }
});
