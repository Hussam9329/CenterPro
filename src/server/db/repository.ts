/** Stable persistence API used by routes, domain services and backup import.
 * Writers keep authorization, state locking, data/auth saves and revision changes
 * in one transaction; these modules never start independent transactions. */
export { collectionNames, type CollectionName } from './collections';
export { lockState, bumpRevision, loadData, saveData, dataCounts } from './data-repository';
export { loadAuthStore, saveAuthStore } from './credentials-repository';
export { DataReferenceError, validateDataReferences, validateAuthReferences } from './reference-validation';
