# TODO before publishing

## 1. Verify on real devices
- [ ] Group call with 2+ clients: audio, video, screen share
- [ ] 1:1 call through coturn (two different networks)
- [ ] Push on Android (FCM) and iOS (Expo/APNs) with real keys
- [ ] Electron build: install, autostart, notifications
- [ ] Real SMTP: e-mail verification and password reset (the only recovery path now)
- [ ] Browser check of UI that only API tests cover: stories, export, translate, bot buttons, status, inline bots

## 2. Design pass
- [ ] Message bubbles, chat header, composer
- [ ] Settings (all sections), admin panel
- [ ] Light theme end to end
- [ ] Web layout at phone width
- [ ] Contrast of chat-list time and badges in dark theme
- [ ] Screenshots for README

## 3. Repository
- [ ] `git init`, first commit, push
- [ ] CONTRIBUTING.md, issue/PR templates, SECURITY.md
- [ ] README: "change dev passwords in production" note
- [ ] `pnpm audit`, update vulnerable dependencies
- [ ] Run the CI workflow once and fix what fails

## 4. Cleanup
- [ ] Drop dead phone data: `UserPhone`, `findByPhone` privacy flag, `SmsService` (needs a migration)

## 5. Features not built yet
- [x] Animated stickers (GIF/WebP/WebM) and large emoji; no paid tiers
- [x] Bot mini-apps (no payments)

## 6. Later
- [ ] VPS deploy with HTTPS (`docs/DEPLOY-VPS.md`), run the prod compose stack
- [ ] Load testing, external security review
- [ ] Mobile store releases (App Store / Google Play)

## Desktop (Windows)
- Build: `pnpm --filter @FLUX/desktop build:win` -> `apps/desktop/release/FLUX Setup x.y.z.exe` (NSIS, choose folder, shortcuts).
- The app serves the web client from a local loopback server and forwards /api and /ws to the FLUX server: set `FLUX_SERVER_URL` or `%APPDATA%/FLUX/config.json` `{"serverUrl":"https://..."}` (default http://127.0.0.1:3000).
- Auto-update needs a `publish` feed (GitHub Releases or generic URL) in `apps/desktop/package.json` `build`; without it the updater stays silent.
- Code signing is not set up (SmartScreen will warn); needs a certificate.
- Without Developer Mode electron-builder cannot extract winCodeSign: exe icon is set by `build/afterPack.cjs`.
