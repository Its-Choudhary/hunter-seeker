// App-wide state: who I am, and the game session (if any).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { base64 } from '@scure/base';
import { create } from 'zustand';

import { newGameSecret } from './engine/crypto';
import { type Identity, Session, newIdentity } from './engine/session';
import type { Settings } from './engine/types';
import { setBackgroundTracking, startLocation, stopLocation } from './location';
import { PLAYER_COLORS } from './ui/theme';

export interface Profile {
  name: string;
  color: string;
}

interface Saved {
  secret: string; // base64
  identity: Identity;
  joinedAt: number;
}

interface AppStore {
  ready: boolean;
  profile: Profile | null;
  saved: Saved | null;
  session: Session | null;
  version: number; // bumps whenever the session changes
  init(): Promise<void>;
  setProfile(p: Profile): Promise<void>;
  createGame(settings: Settings): void;
  joinGame(secret: Uint8Array): void;
  rejoin(): void;
  leave(sayBye?: boolean): Promise<void>;
}

const K_PROFILE = 'hs.profile';
const K_GAME = 'hs.game';

let unsub: (() => void) | undefined;
let bgWanted = false;

/** Background location only while the game is actually running. */
function syncBackground(s: Session) {
  const running = s.state.phase === 'running' && !s.outcome();
  if (running !== bgWanted) {
    bgWanted = running;
    void setBackgroundTracking(running);
  }
}

export const useApp = create<AppStore>((set, get) => {
  function run(secret: Uint8Array, identity: Identity, joinedAt: number, createWith?: Settings) {
    get().session?.stop();
    unsub?.();
    const session = new Session(secret, identity, undefined, joinedAt - 6 * 3600_000);
    unsub = session.subscribe(() => {
      set({ version: session.version });
      syncBackground(session);
    });
    session.start(createWith);
    startLocation(session);
    const saved = { secret: base64.encode(secret), identity, joinedAt };
    AsyncStorage.setItem(K_GAME, JSON.stringify(saved)).catch(() => {});
    set({ session, saved, version: 0 });
  }

  function freshIdentity() {
    const p = get().profile ?? { name: 'Player', color: PLAYER_COLORS[0] };
    return newIdentity(p.name, p.color);
  }

  return {
    ready: false,
    profile: null,
    saved: null,
    session: null,
    version: 0,

    async init() {
      try {
        const [p, g] = await Promise.all([AsyncStorage.getItem(K_PROFILE), AsyncStorage.getItem(K_GAME)]);
        set({ profile: p ? JSON.parse(p) : null, saved: g ? JSON.parse(g) : null });
      } catch {}
      // Never keep tracking in the background from an earlier run (e.g. the
      // app was closed mid-game); rejoining turns it back on if still running.
      bgWanted = false;
      void setBackgroundTracking(false);
      set({ ready: true });
    },

    async setProfile(profile) {
      set({ profile });
      get().session?.rename(profile.name, profile.color);
      await AsyncStorage.setItem(K_PROFILE, JSON.stringify(profile)).catch(() => {});
    },

    createGame(settings) {
      run(newGameSecret(), freshIdentity(), Date.now(), settings);
    },

    joinGame(secret) {
      const saved = get().saved;
      // Re-joining the same game keeps the same identity (and team keys).
      if (saved && saved.secret === base64.encode(secret)) return get().rejoin();
      run(secret, freshIdentity(), Date.now());
    },

    rejoin() {
      const saved = get().saved;
      if (!saved) return;
      if (get().session) return;
      run(base64.decode(saved.secret), saved.identity, saved.joinedAt);
    },

    async leave(sayBye = true) {
      const s = get().session;
      if (s && sayBye) {
        s.leave();
        await new Promise((r) => setTimeout(r, 1500)); // let the goodbye go out
      }
      s?.stop();
      unsub?.();
      bgWanted = false;
      stopLocation(); // also stops background tracking
      set({ session: null, saved: null });
      await AsyncStorage.removeItem(K_GAME).catch(() => {});
    },
  };
});

/** After the player grants background permission mid-game, switch it on. */
export function retryBackground() {
  const s = useApp.getState().session;
  bgWanted = false;
  if (s) syncBackground(s);
}

/** Re-render when the session changes; returns the session. */
export function useSession() {
  useApp((s) => s.version);
  return useApp((s) => s.session);
}
