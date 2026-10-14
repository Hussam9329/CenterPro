/** Public authentication boundary. Internal modules separate session resolution,
 * transactional snapshots, login rate limiting and audit request metadata. */
export {
  SESSION_HOURS, REMEMBER_DAYS, sessionCookieName, readSessionToken,
  setSessionCookie, clearSessionCookie, resolveAccount, resolveSession,
  type Identity,
} from './auth/sessions';
export { requireIdentity, baghdadDate, makeSnapshot, withState, type StateContext } from './auth/state';
export { trustedRequestIp, stampAuditMetadata } from './auth/request-metadata';
export { LOGIN_WINDOW_MS, LOGIN_ACCOUNT_LIMIT, LOGIN_IP_LIMIT, login, type LoginOutcome } from './auth/login';
