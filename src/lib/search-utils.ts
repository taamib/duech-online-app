/**
 * Utility functions for search functionality
 */

/**
 * Parse a comma-separated string parameter into an array
 */
export function parseListParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

import {
  MEANING_MARKER_KEYS,
  MeaningMarkerKey,
  createEmptyMarkerFilterState,
} from '@/lib/definitions';

/**
 * Local type for filters with required arrays (used in search-page component)
 */
export type LocalSearchFilters = {
  categories: string[];
  origins: string[];
  letters: string[];
  dictionaries: string[];
} & Record<MeaningMarkerKey, string[]>;

/**
 * Check if search filters have changed by comparing each filter array
 */
export function filtersChanged(
  prevFilters: LocalSearchFilters,
  newFilters: LocalSearchFilters
): boolean {
  if (arraysDiffer(prevFilters.categories, newFilters.categories)) return true;
  if (arraysDiffer(prevFilters.origins, newFilters.origins)) return true;
  if (arraysDiffer(prevFilters.letters, newFilters.letters)) return true;
  if (arraysDiffer(prevFilters.dictionaries, newFilters.dictionaries)) return true;

  return MEANING_MARKER_KEYS.some((key) => arraysDiffer(prevFilters[key], newFilters[key]));
}

/**
 * Create a deep copy of search filters
 */
export function cloneFilters(filters: LocalSearchFilters): LocalSearchFilters {
  const base = {
    categories: [...filters.categories],
    origins: [...filters.origins],
    letters: [...filters.letters],
    dictionaries: [...filters.dictionaries],
    ...createEmptyMarkerFilterState(),
  };

  for (const key of MEANING_MARKER_KEYS) {
    base[key] = [...filters[key]];
  }

  return base;
}

export function createEmptyLocalFilters(): LocalSearchFilters {
  const markerDefaults = createEmptyMarkerFilterState();
  const base = {
    categories: [] as string[],
    origins: [] as string[],
    letters: [] as string[],
    dictionaries: [] as string[],
    ...markerDefaults,
  };

  return base;
}

function arraysDiffer(a: string[] = [], b: string[] = []): boolean {
  if (a.length !== b.length) return true;
  return a.some((value, index) => value !== b[index]);
}

/**
 * User type for search functionality
 */
export interface User {
  id: number;
  username: string;
  email?: string | null;
  role: string;
}
function mapUsersToOptions(users: User[]) {
  return users.map((user) => ({
    value: user.id.toString(),
    label: user.username,
  }));
}

/**
 * Get lexicographer and Admins options for dropdowns
 */
export function getLexicographerAndAdminOptions(users: User[]) {
  return mapUsersToOptions(
    users.filter((user) => user.role === 'lexicographer' || user.role === 'admin')
  );
}

function filterLexicographersAndAdmins(users: User[]) {
  return users.filter((user) => user.role === 'lexicographer' || user.role === 'admin');
}

export function getLexicographerByRole(
  users: User[],
  currentUsername: string,
  isAdmin: boolean,

  isLexicographer: boolean
) {
  if (isAdmin) {
    return mapUsersToOptions(filterLexicographersAndAdmins(users));
  }

  if (isLexicographer) {
    const filteredUsers = users.filter((user) => user.username === currentUsername);
    return mapUsersToOptions(filteredUsers);
  }

  return [];
}
export function getStatusByRole(
  statusOptions: { value: string; label: string }[],
  isAdmin: boolean,
  isLexicographer: boolean
) {
  if (isAdmin) {
    return statusOptions.filter((status) => status.value !== 'imported');
  }

  if (isLexicographer) {
    return statusOptions.filter(
      (status) => status.value === 'redacted' || status.value === 'preredacted'
    );
  }

  return [];
}
