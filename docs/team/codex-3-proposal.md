H26-1 v2, target base 98ece8b. Owned paths src/** and packages/challenges/** excluding *.test.ts. Proposed changes touch only src/navigation.ts and src/App.tsx. Freeze this helper contract for Claude 2 ahead of App tests. routeSearch returns a suffix with a leading ? or an empty string. Prefix it with / for history and invitation URLs. Remix parent is serialized as ?screen=arena&parent=ID so restoring its URL can reload the original challenge config. Verify the proposed opaque URL-safe ID check against the baseline server generator and saved IDs before applying. The supplied frontend source does not establish the ID alphabet and length. The provisional check supports UUIDs and URL-safe short IDs.

NEW src/navigation.ts
```ts
export type RelayRoute = { screen: 'relay' | 'premiere'; id: string };

export type Route =
  | { screen: 'home' }
  | { screen: 'arena'; parentId?: string }
  | RelayRoute
  | { screen: 'invalid' };

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

const validId = (id: string) =>
  id.length > 0 && id.length <= 128 && !/[^A-Za-z0-9_-]/.test(id);

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
```

The storage helpers accept explicit storage so tests can use separate stores. Only a value of '1' at the relay-specific key grants host presentation; no names or URL fields participate. Test canonical waiting/premiere mismatch in both directions, empty and duplicate routing parameters, and remix parent round-trip. Validation has not run in this service.

---

H26-1 v2, target 98ece8b. In src/App.tsx add useRef to the existing React import and ApiError to the existing createRelay/getRelay/completeRelay import. Add `import { canonicalRelayRoute, hasHostMarker, parseRoute, rememberHost, routeSearch, type Route } from './navigation';`. Keep the existing Screen type and other imports. Replace the App logic from `export default function App()` through the replayAttempt declaration. JSX edits follow separately.

```tsx
export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [config, setConfig] = useState<ChallengeConfig>(DEFAULT_CONFIG);
  const [attempt, setAttempt] = useState<AttemptResult | null>(null);
  const [relay, setRelay] = useState<Relay | null>(null);
  const [name, setName] = useState(() => {
    try {
      return sessionStorage.getItem('rib-name') || '';
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [arenaKey, setArenaKey] = useState(0);
  const [sourceRelay, setSourceRelay] = useState<string | undefined>();
  const [host, setHost] = useState(false);
  const [routePending, setRoutePending] = useState(false);
  const [routeFailure, setRouteFailure] = useState<'invalid' | 'retryable' | 'unavailable' | null>(null);
  const generation = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const proven = !!attempt?.success && sameConfig(attempt.config, config);
  const invitation = relay
    ? `${location.origin}/${routeSearch({ screen: 'relay', id: relay.id })}`
    : '';

  useEffect(() => {
    function restoreFromLocation() {
      enterRoute(parseRoute(location.search), true);
    }
    restoreFromLocation();
    window.addEventListener('popstate', restoreFromLocation);
    return () => {
      window.removeEventListener('popstate', restoreFromLocation);
      generation.current += 1;
      activeRequest.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('rib-name', name);
    } catch {
      // The current form can still use the name in memory.
    }
  }, [name]);

  function writeRoute(route: Exclude<Route, { screen: 'invalid' }>, mode: 'push' | 'replace') {
    const url = `/${routeSearch(route)}`;
    if (mode === 'push') history.pushState(null, '', url);
    else if (location.pathname + location.search + location.hash !== url) {
      history.replaceState(null, '', url);
    }
  }

  function enterRoute(route: Route, restoring: boolean, remixConfig?: ChallengeConfig) {
    const token = ++generation.current;
    activeRequest.current = null;
    setBusy(false);
    setError('');
    setNotice('');
    setRelay(null);
    setHost(false);
    setAttempt(null);
    setReplayIndex(null);
    setConfig(remixConfig ?? DEFAULT_CONFIG);
    setSourceRelay(route.screen === 'arena' ? route.parentId : undefined);
    setRoutePending(false);
    setRouteFailure(null);
    setScreen(route.screen === 'home' || route.screen === 'arena' ? route.screen : 'relay');

    if (route.screen === 'invalid') {
      setRouteFailure('invalid');
      return;
    }
    if (route.screen === 'home' || route.screen === 'arena') writeRoute(route, 'replace');
    if (route.screen === 'home') return;
    if (route.screen === 'arena') {
      setArenaKey((key) => key + 1);
      if (restoring) setNotice('Unpublished attempts reset when you reopen the arena.');
      if (route.parentId && !remixConfig) void loadRoute(route.parentId, token, true);
      return;
    }
    void loadRoute(route.id, token, false);
  }

  async function loadRoute(id: string, token: number, remix: boolean) {
    setRoutePending(true);
    try {
      const result = await getRelay(id);
      if (token !== generation.current) return;
      if (remix) setConfig(result.challenge);
      else showRelay(result, readHost(id));
    } catch (cause) {
      if (token !== generation.current) return;
      if (cause instanceof ApiError && cause.status === 404) setRouteFailure('invalid');
      else if (!(cause instanceof ApiError) || cause.status >= 500) setRouteFailure('retryable');
      else setRouteFailure('unavailable');
    } finally {
      if (token === generation.current) setRoutePending(false);
    }
  }

  function readHost(id: string) {
    try {
      return hasHostMarker(sessionStorage, id);
    } catch {
      return false;
    }
  }

  function showRelay(result: Relay, asHost: boolean, keepGuestAttempt = false) {
    const route = canonicalRelayRoute(result.id, result.status);
    setRelay(result);
    setConfig(result.challenge);
    setHost(asHost);
    if (asHost) setAttempt(result.hostAttempt);
    else if (!keepGuestAttempt || result.status === 'completed') setAttempt(null);
    setReplayIndex(null);
    setScreen(route.screen);
    writeRoute(route, 'replace');
  }

  function changeConfig(c: ChallengeConfig) {
    if (activeRequest.current !== null || relay) return;
    setConfig(c);
    setAttempt(null);
    setNotice('');
  }

  function navigate(route: Exclude<Route, { screen: 'invalid' }>, remixConfig?: ChallengeConfig) {
    writeRoute(route, 'push');
    enterRoute(route, false, remixConfig);
  }

  function home() {
    navigate({ screen: 'home' });
  }

  function newChallenge() {
    navigate({ screen: 'arena' });
  }

  function retryRoute() {
    enterRoute(parseRoute(location.search), true);
  }

  function startRequest() {
    const token = generation.current;
    activeRequest.current = token;
    setBusy(true);
    setError('');
    setNotice('');
    return token;
  }

  function endRequest(token: number) {
    if (token !== generation.current) return;
    activeRequest.current = null;
    setBusy(false);
  }

  function showRequestError(cause: unknown, token: number) {
    if (token !== generation.current) return;
    setError(cause instanceof Error ? cause.message : 'The request failed. Please try again.');
  }

  async function publish() {
    if (screen !== 'arena' || activeRequest.current !== null || !attempt || !proven) return;
    if (!name.trim()) {
      setError('Add your player name before passing the shot.');
      return;
    }
    const token = startRequest();
    try {
      const result = await createRelay({
        hostName: name.trim(),
        hostAttempt: attempt,
        parentChallengeId: sourceRelay,
      });
      if (token !== generation.current) return;
      let recoverySaved = true;
      try {
        rememberHost(sessionStorage, result.id);
      } catch {
        recoverySaved = false;
      }
      showRelay(result, true);
      setNotice(recoverySaved
        ? 'Your relay is ready. Send the link to your teammate.'
        : 'Your relay is ready. Browser storage is unavailable, so refreshing may lose your host view.');
    } catch (cause) {
      showRequestError(cause, token);
    } finally {
      endRequest(token);
    }
  }

  async function finishRelay() {
    if (!guest || activeRequest.current !== null || !relay || !attempt || !proven) return;
    if (!name.trim()) {
      setError('Add your player name to join the premiere.');
      return;
    }
    const token = startRequest();
    try {
      const result = await completeRelay(relay.id, {
        guestName: name.trim(),
        guestAttempt: attempt,
      });
      if (token === generation.current) showRelay(result, false);
    } catch (cause) {
      showRequestError(cause, token);
    } finally {
      endRequest(token);
    }
  }

  async function refreshRelay() {
    if (!relay || activeRequest.current !== null) return;
    const token = startRequest();
    try {
      const result = await getRelay(relay.id);
      if (token !== generation.current) return;
      showRelay(result, host);
      if (result.status === 'waiting') {
        setNotice('Your teammate has not finished yet. Check again after they land it.');
      }
    } catch (cause) {
      if (token === generation.current && cause instanceof ApiError && cause.status === 404) {
        setRelay(null);
        setAttempt(null);
        setHost(false);
        setRouteFailure('invalid');
      } else {
        showRequestError(cause, token);
      }
    } finally {
      endRequest(token);
    }
  }

  async function copyLink() {
    const token = generation.current;
    try {
      await navigator.clipboard.writeText(invitation);
      if (token === generation.current) {
        setNotice('Invitation copied. Your teammate can open it on this server.');
      }
    } catch {
      if (token === generation.current) setNotice('Copy the invitation from the invitation field.');
    }
  }

  const guest = screen === 'relay' && !!relay && !host;
  const replayAttempt =
    replayIndex === 0
      ? relay?.hostAttempt
      : replayIndex === 1
        ? relay?.guestAttempt
        : undefined;
```

One simplification for application: remove the unused `keepGuestAttempt` parameter from showRelay and replace its `else if` with `else setAttempt(null);`. All callers intentionally clear a guest attempt when applying a relay response. Generation guards protect fetches, mutations and clipboard feedback after navigation. Navigation does not cancel a server mutation already accepted, so a late publish can create a server row while the UI remains on the newer route. Persistent guest/host behavior depends on same-tab sessionStorage availability. No validation or edits performed here.

---

H26-1 v2, base 98ece8b. Exact src/App.tsx JSX edits for the supplied boundaries.

Replace the workspace branch from `{busy && !relay && guest ? (` through the `< >` fragment opener of the premiere branch (the actual opener is `<>`) with:
```tsx
          {routePending ? (
            <div className="loading" role="status">
              {screen === 'arena' ? 'LOADING THE REMIX…' : 'LOADING YOUR SQUAD’S SHOT…'}
            </div>
          ) : routeFailure ? (
            <div className="empty-state">
              <h2>{screen === 'arena' ? 'THIS REMIX COULDN’T LOAD' : 'THIS RELAY COULDN’T LOAD'}</h2>
              <p role="alert">
                {routeFailure === 'invalid'
                  ? 'Check the link, or start a challenge of your own.'
                  : routeFailure === 'retryable'
                    ? 'The server couldn’t load this challenge. Try again.'
                    : 'This challenge is unavailable. Open the link again or start a new challenge.'}
              </p>
              {routeFailure === 'retryable' && (
                <button className="secondary" onClick={retryRoute}>TRY AGAIN</button>
              )}
              <button className="primary" onClick={newChallenge}>
                ENTER THE ARENA <Arrow />
              </button>
            </div>
          ) : screen === 'premiere' && relay ? (
            <>
```

Replace the complete inline remix onClick prop with:
```tsx
onClick={() => navigate({ screen: 'arena', parentId: relay.id }, relay.challenge)}
```

In the supplied share block, change `) : relay ? (` to `) : host && relay ? (` and add `{busy ? 'CHECKING TEAMMATE PROGRESS…' : 'CHECK TEAMMATE PROGRESS ↻'}` as the progress button text. Keep the guest finish gate and host publish gate as supplied. Existing replay JSX stays wired to replayAttempt and replayIndex.

The supplied packet stops before the actual arena props and workspace headings. During application, inspect any remaining `screen === 'relay'`, `screen === 'arena'` and `guest` uses. A predicate that identifies a guest must use `guest`. A predicate that displays the host invitation, progress or notices must allow `screen === 'relay' && host`. If the game remains mounted for the published host and takes a direct `onAttempt={setAttempt}`, ensure gameplay callbacks cannot overwrite the fetched host attempt or write into a later route. For an existing direct setter prop, add `const attemptGeneration = generation.current;` before rendering and use `onAttempt={(result) => { if (attemptGeneration === generation.current && !host && activeRequest.current === null) setAttempt(result); }}` in the live arena only. If the game intentionally stores callbacks across renders, verify its existing prop handling before applying that callback change. No additional package or CSS files are needed based on the provided blocks.

Desktop validation should check build/typecheck, existing tests, independent regressions, and a browser pass covering host refresh, separate session guest access, completion canonicalization, Back/Forward including remix, retry after network/5xx and stale responses after navigating away. The service did not execute these checks. A handoff commit is pending desktop application.