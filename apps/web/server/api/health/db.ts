import { defineEventHandler, toWebRequest } from 'h3';
import { databaseHealth } from '../../core/database-health';
export default defineEventHandler((event) => databaseHealth(toWebRequest(event)));
