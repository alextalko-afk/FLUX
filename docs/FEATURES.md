# Newer features

| Feature | Where | Notes |
| --- | --- | --- |
| Polls and quizzes | composer "⋯" → Poll | anonymous/multiple/quiz modes; results per viewer |
| Stickers | composer sticker picker | packs, recents, favourites |
| Forum topics | group → "Forum" in settings | per-topic history and posting |
| Channels | channel settings | post comments, statistics, scheduled posts |
| Geolocation | composer "⋯" → Location | static card; live location with expiry |
| QR login | login → "QR" | approve from a signed-in device; single-use token |
| Video/audio probing | automatic | needs `ffmpeg`/`ffprobe` (in the server image): duration, size, video poster |
| Group calls | chat header → call | LiveKit SFU; `--profile calls`, `LIVEKIT_*` |
| Mobile push | mobile app | FCM/Expo tokens; queued via BullMQ (`push`) |
| Desktop autostart | Settings (desktop app) | Electron login item, tray |
| Stories | top of the chat list | 24 h photo/video, contacts only, view counter for the author |
| Chat export | chat info → Export | JSON/HTML of your visible history; not for secret chats |
| Voice transcription | voice message menu → Transcribe | needs `TRANSCRIBE_URL` (OpenAI-compatible); cached 30 days |
| Message translation | message menu → Translate | needs `TRANSLATE_URL` (LibreTranslate API); cached 24 h |
| Bot inline buttons | bot message | `callbackData` buttons; a press is sent to the bot as a `callback_query` webhook |
| Bot inline mode | composer: `@bot query` | bot webhook gets `inline_query`, must answer within 3 s with `{results:[{id,title,text}]}` |
| Bot catalog | Settings → Bots | owners create bots, tick "List in catalog"; search by name/username |
| Encrypted groups | New group → "End-to-end encryption" | text only; the group key is sealed to each member device by an admin; rotates when someone leaves; no files, polls, search, bots. Members need a device key (created on first use) |
| Animated stickers | sticker picker → add pack | PNG, WebP, GIF and WebM (looped, muted) up to 512 KB |
| Large emoji | message of 1-3 emoji | shown large with a pop animation |
| Bot mini-apps | bot message button with `webAppUrl` | https page opens in a sandboxed frame; signed `initData` arrives in `#fluxInitData=`; verify HMAC-SHA256 (key = hex sha256 of the bot token, data = sorted `k=v` lines joined by newline, without `hash`). The page closes itself with `parent.postMessage({type:"flux:close"},"*")`. No payments |
| Emoji status | Settings → Profile | optional duration; shown next to the name on the profile |
| Monitoring | `--profile monitoring` | Prometheus + Grafana dashboard + alert rules, see DEPLOY-VPS.md |
| Admin → System | Admin panel | registration switch, maintenance mode, upload limit, queue retry/clean |
| Metrics | `GET /api/v1/metrics` | Prometheus, `Authorization: Bearer $METRICS_TOKEN` |

Privacy has 14 switches (`findByPhone` is the newest). Runtime settings live in the `SystemSetting` table and change without a restart.
