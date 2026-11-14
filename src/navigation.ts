export type RelayRoute = { screen: 'relay' | 'premiere'; id: string };

export type Route =
  | { screen: 'home' }
  | { screen: 'arena'; parentId?: string }
  | RelayRoute
  | { screen: 'invalid' };

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

const validId = (id: string) =>
  id.length > 0 && id.length <= 100 && !/[^A-Za-z0-9_-]/.test(id);

export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const ids = params.getAll('relay');
  const screens = params.getAll('screen');
  const parents = params.getAll('parent');
  const screen = screens[0];

  if (screens.length > 1) return { screen: 'invalid' };
  if (ids.length) {
    const id = ids[0];
    if (ids.length !== 1 || !validId(id) || parents.length ||
        (screen !== undefined && screen !== 'premiere')) {
      return { screen: 'invalid' };
    }
    return { screen: screen === 'premiere' ? 'premiere' : 'relay', id };
  }
  if (screen === 'arena') {
    if (!parents.length) return { screen: 'arena' };
    if (parents.length === 1 && validId(parents[0])) {
      return { screen: 'arena', parentId: parents[0] };
    }
    return { screen: 'invalid' };
  }
  return screen === undefined && !parents.length
    ? { screen: 'home' }
    : { screen: 'invalid' };
}

export function routeSearch(route: Exclude<Route, { screen: 'invalid' }>): string {
  switch (route.screen) {
    case 'home':
      return '';
    case 'arena':
      return route.parentId
        ? `?screen=arena&parent=${encodeURIComponent(route.parentId)}`
        : '?screen=arena';
    case 'relay':
      return `?relay=${encodeURIComponent(route.id)}`;
    case 'premiere':
      return `?relay=${encodeURIComponent(route.id)}&screen=premiere`;
  }
}

export function canonicalRelayRoute(id: string, status: 'waiting' | 'completed'): RelayRoute {
  return { screen: status === 'completed' ? 'premiere' : 'relay', id };
}

export function hostMarkerKey(id: string): string {
  return `rib-host-relay:${id}`;
}

export function hasHostMarker(storage: StorageReader, id: string): boolean {
  return storage.getItem(hostMarkerKey(id)) === '1';
}

export function rememberHost(storage: StorageWriter, id: string): void {
  storage.setItem(hostMarkerKey(id), '1');
}
