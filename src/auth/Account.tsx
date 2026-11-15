import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../competitions/api';
import './account.css';
import { clearPrivateReport } from './session';

type Account = { username: string; playerId: string; name: string };
type Session = { account: Account | null; storageDurable: boolean };
function useAccount() {
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const refresh = () => { api<Session>('/api/auth/me').then(data => { if (alive) { setSession(data); setError(''); } })
      .catch(() => { if (alive) setError('Account information could not load. Refresh to try again.'); }); };
    refresh(); window.addEventListener('rib:account-change', refresh);
    return () => { alive = false; window.removeEventListener('rib:account-change', refresh); };
  }, []);
  return { session, error };
}
function go(path: string) {
  window.dispatchEvent(new Event('rib:account-change'));
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
function nextPage() {
  const candidate = new URLSearchParams(window.location.search).get('next') ?? '';
  return /^\/(?:practice|leaderboards|events(?:\/[A-Za-z0-9-]+)?|host(?:\/events\/[A-Za-z0-9_-]+)?)?$/.test(candidate) ? candidate : '/account';
}
export function AccountLink({ path }: { path: string }) {
  const { session } = useAccount();
  return <a className="showcase-account-link" href={session?.account ? '/account' : `/login?next=${encodeURIComponent(path)}`}
    aria-current={['/login', '/signup', '/account'].includes(path) ? 'page' : undefined}>
    {session?.account ? session.account.username : 'Sign in'}<span aria-hidden="true"> ↗</span>
  </a>;
}
export default function AccountPage({ mode }: { mode: 'login' | 'signup' | 'account' }) {
  const { session, error: loadError } = useAccount();
  const [username, setUsername] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [show, setShow] = useState(false);
  const signup = mode === 'signup';
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (signup && password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await api<Session & { guestAdopted: boolean }>(`/api/auth/${signup ? 'register' : 'login'}`, { username, password });
      if (!signup || !result.guestAdopted) { try { clearPrivateReport(window.sessionStorage); } catch { /* Storage may be blocked. */ } }
      setPassword(''); setConfirm(''); go(nextPage());
    }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await api('/api/auth/logout', {}); try { clearPrivateReport(window.sessionStorage); } catch { /* Storage may be blocked. */ } go('/'); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const next = typeof window === 'undefined' ? '' : window.location.search;
  return <section className="showcase-route auth-layout" aria-labelledby="account-heading">
    <div className="auth-intro">
      <p className="showcase-eyebrow">YOUR MOMENTS. YOUR NAME.</p>
      <h1 id="account-heading">{session?.account ? <>WELCOME BACK.<br /><em>RUN IT BACK.</em></> : <>MAKE YOUR<br /><em>MARK.</em></>}</h1>
      <p>One account for your shots, progress and community events.</p>
      <ul><li>Keep your XP, streaks and achievements together.</li><li>Return to your profile from another device.</li><li>Manage the events you create.</li></ul>
      <a href={session?.account ? '/practice' : '/'} className="auth-guest-link">{session?.account ? 'Back to practice ↗' : 'Just here to play? Continue as guest ↗'}</a>
    </div>
    <div className="auth-card">
      {loadError && <p role="alert">{loadError}</p>}
      {!session && !loadError ? <p role="status">Loading your account…</p> : session?.account ? <>
        <p className="showcase-eyebrow">YOUR ACCOUNT</p><h2>{session.account.name}</h2>
        <p>Signed in as <b>{session.account.username}</b></p>
        <div className="auth-account-actions"><a className="showcase-start" href="/practice">Take the shot ↗</a><a href="/leaderboards">Your progress</a><a href="/host">Manage your events</a></div>
        <button className="auth-secondary" type="button" disabled={busy} onClick={() => void logout()}>Sign out</button>
      </> : <>
        <nav className="auth-mode" aria-label="Account options"><a href={`/login${next}`} aria-current={!signup ? 'page' : undefined}>Sign in</a><a href={`/signup${next}`} aria-current={signup ? 'page' : undefined}>Create account</a></nav>
        <h2>{signup ? 'Join the lineup.' : 'Good to see you.'}</h2>
        <p>{signup ? 'Create an account and keep this browser’s existing progress and events.' : 'Sign in to load your account’s progress and events.'}</p>
        {!signup && <p className="auth-fine">Separate guest progress is not combined with your account. It stays in this browser and is available again after you sign out.</p>}
        <form onSubmit={submit}>
          <label htmlFor="auth-username">Username</label><input id="auth-username" name="username" required minLength={3} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{2,23}" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value)} aria-describedby="username-help" />
          <p id="username-help" className="auth-fine">3–24 characters: letters, numbers, underscores, dots or hyphens.</p>
          <label htmlFor="auth-password">Password</label><div className="auth-password"><input id="auth-password" name="password" type={show ? 'text' : 'password'} required minLength={15} maxLength={128} autoComplete={signup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} aria-describedby="password-help" /><button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button></div>
          <p id="password-help" className="auth-fine">Use a unique passphrase of 15–128 characters. Spaces are welcome.</p>
          {signup && <><label htmlFor="auth-confirm">Confirm password</label><input id="auth-confirm" name="confirmPassword" type={show ? 'text' : 'password'} required minLength={15} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} /></>}
          <button className="showcase-start auth-submit" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account ↗' : 'Sign in ↗'}</button>
        </form>
      </>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <details className="auth-details"><summary>Showcase account details</summary><p>{session?.storageDurable ? 'Your account uses persistent server storage.' : 'This showcase uses temporary server storage. Accounts, progress and events may reset when the server restarts or redeploys.'}</p><p>Keep your login details safe. Password recovery and email sign-in are not available.</p></details>
    </div>
  </section>;
}
