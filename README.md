# Hunter Seeker 🎯

Real-life hide & seek for Android and iOS. Hiders, hunters and seekers play
on foot inside a zone; hiders' exact locations are pinged to hunters on a
timer. **No servers** — every phone runs the whole game.

## Roles

| Role | Sees | Can do |
|---|---|---|
| 🫥 Hider | Countdown to their next ping, fellow hiders | Hide. Shows a rotating QR / 6-digit code when tagged |
| 🎯 Hunter | Exact pings (every 5 → 4 → 3 → 1 min) + teammates | **Catch** by scanning the hider's QR (or typing the code) |
| 👁 Seeker | Rough 250 m circles, twice as often | **Spot**: if really within 150 m, the hider is revealed to hunters |
| 🧑‍⚖️ Referee | Everything | Watches (any player left without a role) |

Everyone must stay in the zone. Hunters/seekers outside it are **frozen**
(can't catch or spot, plus 60 s after returning). Hiders outside it have
their location **broadcast** every 20 s. Anyone can **pause** or send
**SOS** (pauses for all and shows their location).

## How "no servers" works

- The **join QR** contains a random game secret. All messages are encrypted
  with it and sent to ~6 free public Nostr relays at once. Relays only ever
  see encrypted noise; if some go down, the rest carry the game; if the phone
  is offline, messages queue and send later.
- Every phone keeps the full message log and computes the game (ping times,
  catches, freezes, winner) identically. There is no host once the game
  starts — anyone can leave or crash and the game carries on.
- At start, each team gets its own key: exact pings are sealed so **only
  hunters' phones can read them**; seekers only get the rough circle.
- Catch QRs are signed by the hider's key and change every 30 s.

Code: `src/engine/` (pure TypeScript, no UI) — `session.ts` (one phone's
game), `reducer.ts` (rules), `schedule.ts` (clock), `crypto.ts`,
`transport.ts` (relays), `geo.ts` (zone maths).

## Try it on your phone (no Xcode needed)

1. Install **Expo Go** from the App Store / Play Store.
2. On the Mac, in this folder: `npx expo start`
3. Scan the QR in the terminal (iPhone: Camera app; Android: Expo Go). The
   phone and Mac must be on the same Wi-Fi.

Limits in Expo Go: the app must stay **open on screen** during a game (it
keeps the screen awake). Locked-phone pinging needs a real build (below).

## Testing on the Mac

```bash
npx tsx scripts/selftest.mts                     # engine unit checks
npx tsx scripts/bots.mts --create --hiders 3 --hunters 2 --seekers 1 --rogue
npx tsx scripts/bots.mts --join HS1.xxxx --hiders 2 --seekers 1   # bots join your game
npx expo start --web                             # play in the browser
```

In dev builds, the game menu has **Simulate GPS** (tap the map to move) and
the create screen has **quick test timings** (30 s pings, 4 min game).

## Installable builds

### Android APK (built on this Mac, no accounts)

```bash
brew install openjdk@17 && brew install --cask android-commandlinetools
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk
sdkmanager --sdk_root=$ANDROID_HOME --licenses        # read & accept Google's SDK license
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
# → android/app/build/outputs/apk/release/app-release.apk
```

Network gotcha (some Indian ISPs): one GitHub download IP (185.199.109.133)
is unreachable and Java doesn't fall back like curl does, so the Gradle
download times out. Fix: `curl -L -o ~/.gradle/local-dists/gradle-<ver>-bin.zip
https://services.gradle.org/distributions/gradle-<ver>-bin.zip` and set
`distributionUrl=file\:$HOME/.gradle/local-dists/gradle-<ver>-bin.zip` in
`android/gradle/wrapper/gradle-wrapper.properties` (redo after `prebuild --clean`).

The release APK is signed with the standard debug key — fine for sharing with
friends (Settings → allow installing from this source). Make a real upload key
before putting it on the Play Store.

### iPhone (free Apple ID, 7-day installs)

Install Xcode from the App Store, sign in under Xcode → Settings → Accounts,
plug the iPhone in, enable Developer Mode on it, then:

```bash
npx expo run:ios --device --configuration Release
```

On the phone: Settings → General → VPN & Device Management → trust your Apple
ID. Free-account installs stop opening after 7 days — just run it again.

### Background location

Installed builds keep tracking location **only while a game is running**
(Android shows a "game in progress" notification; iPhone shows the blue
location pill), so pings work with the phone locked. It is switched off the
moment the game ends or the player leaves, and on every app start. Players
grant "Allow all the time" / "Always" from the lobby card. Expo Go can't do
background location, so there the app keeps the screen awake instead.

## How-to-play tutorial

`src/app/tutorial.tsx` plays a narrated, video-style example round (English or
Hindi, toggle in the top-left; home screen links both). The script is in
`src/tutorial/` — `script.ts` (scenes, player paths, events), `content.ts`
(on-screen text), `narration.json` (spoken lines). Movement is animated inside
the map page at full frame rate from keyframed paths.

The narration is pre-rendered with **Kokoro-82M** (local neural TTS, Apache-2.0)
into `assets/tutorial/*.m4a`. After editing `narration.json`, regenerate:

```bash
python3 -m venv .tts && .tts/bin/pip install kokoro-onnx soundfile
npx hyperframes tts "hi" -o /tmp/x.wav   # first run downloads the model to ~/.cache/hyperframes/tts
.tts/bin/python scripts/gen-voice.py ~/.cache/hyperframes/tts
```

If it fails with `…/site-packages/phontab: No such file`, espeak is looking one
folder too high; link its data there:
`for f in .tts/lib/python3*/site-packages/espeakng_loader/espeak-ng-data/*; do ln -s "$f" .tts/lib/python3*/site-packages/; done`

## Next steps

- [ ] Real builds: Android APK (EAS or Android Studio), iPhone via Xcode
- [ ] Bluetooth proximity check on catches
- [ ] Power-ups, shrinking zone, missions, post-game replay
- [ ] Offline map tiles for the zone
