// Feeds GPS fixes into the session.
//
// - In the app: a normal location watch.
// - While a game is RUNNING (installed builds only): background location, so
//   pings keep working with the phone locked. Android shows a "game in
//   progress" notification, iPhone shows the blue location indicator.
// - The moment the game ends or you leave, background tracking is stopped,
//   so the app never runs in the background outside a game.
// - In development you can switch to a simulated position (tap the map).
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { create } from 'zustand';

import type { Session } from './engine/session';
import type { LatLon } from './engine/types';

export const BG_TASK = 'hunter-seeker-game-location';

/** Background location needs a real build; Expo Go and web can't do it. */
export const backgroundSupported =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

interface LocState {
  mode: 'gps' | 'sim';
  status: 'off' | 'asking' | 'denied' | 'on' | 'error';
  error?: string;
  background: 'unsupported' | 'needs-permission' | 'off' | 'on';
}

export const useLocation = create<LocState>(() => ({
  mode: 'gps',
  status: 'off',
  background: backgroundSupported ? 'off' : 'unsupported',
}));

let session: Session | null = null;
let watch: Location.LocationSubscription | null = null;
let simTimer: ReturnType<typeof setInterval> | undefined;
let simPos: LatLon | null = null;

function feed(loc: Location.LocationObject) {
  if (useLocation.getState().mode === 'sim') return;
  session?.setFix({
    lat: loc.coords.latitude,
    lon: loc.coords.longitude,
    acc: loc.coords.accuracy ?? 30,
    t: loc.timestamp || Date.now(),
    speed: loc.coords.speed,
  });
}

// Must be defined at startup (top level), so the OS can deliver fixes even
// when the app was woken in the background.
if (backgroundSupported) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(BG_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    feed(data.locations[data.locations.length - 1]);
  });
}

export async function startLocation(s: Session) {
  session = s;
  if (useLocation.getState().mode === 'sim') return startSim();
  await startGps();
}

async function startGps() {
  stopFeeds();
  useLocation.setState({ status: 'asking', error: undefined });
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      useLocation.setState({ status: 'denied' });
      return;
    }
    watch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000, distanceInterval: 2 },
      feed,
      (reason) => useLocation.setState({ status: 'error', error: String(reason) }),
    );
    useLocation.setState({ status: 'on' });
  } catch (e) {
    useLocation.setState({ status: 'error', error: String((e as Error)?.message ?? e) });
  }
}

function startSim() {
  stopFeeds();
  useLocation.setState({ status: 'on', error: undefined });
  simPos = simPos ?? session?.fix ?? null;
  const tick = () => simPos && session?.setFix({ ...simPos, acc: 5, t: Date.now(), speed: 0 });
  tick();
  simTimer = setInterval(tick, 2000);
}

function stopFeeds() {
  watch?.remove();
  watch = null;
  clearInterval(simTimer);
  simTimer = undefined;
}

export function stopLocation() {
  stopFeeds();
  session = null;
  useLocation.setState({ status: 'off' });
  void setBackgroundTracking(false);
}

export function setSimMode(on: boolean, start?: LatLon | null) {
  useLocation.setState({ mode: on ? 'sim' : 'gps' });
  if (start) simPos = start;
  if (!session) return;
  if (on) startSim();
  else void startGps();
}

/** Move the simulated player (dev testing). */
export function simMoveTo(p: LatLon) {
  simPos = p;
  session?.setFix({ ...p, acc: 5, t: Date.now(), speed: 0 });
}

// ---------- background tracking (only while a game is running) ----------

/** Do we already have "Allow all the time" / "Always"? */
export async function refreshBackgroundPermission() {
  if (!backgroundSupported) return;
  try {
    const p = await Location.getBackgroundPermissionsAsync();
    const cur = useLocation.getState().background;
    if (!p.granted) useLocation.setState({ background: 'needs-permission' });
    else if (cur === 'needs-permission') useLocation.setState({ background: 'off' });
  } catch {}
}

/** Ask for background location. Android opens a settings page ("Allow all the time"). */
export async function requestBackgroundPermission(): Promise<boolean> {
  if (!backgroundSupported) return false;
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    useLocation.setState({ background: bg.granted ? 'off' : 'needs-permission' });
    return bg.granted;
  } catch {
    return false;
  }
}

let bgBusy: Promise<void> = Promise.resolve();

/**
 * Turn background tracking on (game running) or off (game over / left).
 * Calls are queued so on/off can't race each other.
 */
export function setBackgroundTracking(on: boolean): Promise<void> {
  bgBusy = bgBusy.then(() => (on ? startBackground() : stopBackground())).catch(() => {});
  return bgBusy;
}

async function startBackground() {
  if (!backgroundSupported || useLocation.getState().mode === 'sim') return;
  const perm = await Location.getBackgroundPermissionsAsync();
  if (!perm.granted) {
    useLocation.setState({ background: 'needs-permission' });
    return;
  }
  if (!(await Location.hasStartedLocationUpdatesAsync(BG_TASK))) {
    await Location.startLocationUpdatesAsync(BG_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,
      distanceInterval: 3,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.Fitness,
      foregroundService: {
        notificationTitle: 'Hunter Seeker — game in progress',
        notificationBody: 'Sharing your location with your game. Stops automatically when the game ends.',
        notificationColor: '#ff5a36',
        killServiceOnDestroy: true,
      },
    });
  }
  useLocation.setState({ background: 'on' });
}

async function stopBackground() {
  if (!backgroundSupported) return;
  if (await Location.hasStartedLocationUpdatesAsync(BG_TASK)) {
    await Location.stopLocationUpdatesAsync(BG_TASK);
  }
  const st = useLocation.getState().background;
  if (st === 'on') useLocation.setState({ background: 'off' });
}

/** One-off position for centring the zone editor. */
export async function currentPosition(): Promise<LatLon | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync();
    const loc = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: loc.coords.latitude, lon: loc.coords.longitude };
  } catch {
    return null;
  }
}
