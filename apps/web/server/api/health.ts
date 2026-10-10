import { defineEventHandler, toWebRequest } from 'h3';
import { health } from '../core/health';
export default defineEventHandler((event) => health(toWebRequest(event)));
