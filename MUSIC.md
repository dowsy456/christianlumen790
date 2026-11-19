# Chat App Music

Open Music from the account dock beside Settings. People with playlists or uploaded audio also have a **Music** shortcut on their avatar and profile actions menus. Current release versions are in `build-info.json`.

## Features

- Home shows up to six owned playlists, Create beside Playlists, View All when needed, and one horizontal user row sorted by live display name. User pictures and names open their Music profile.
- **Audio** on Home and each Music profile lists that person's uploads A–Z. Search by title, artist or album. Choose **Upload** beside Audio to publish a standalone track, or use the same button inside a playlist. A track started from Audio stops at the end with Repeat Off. Repeat One and Repeat All both replay that single upload. They never advance down the Audio list.
- Right-click an upload or a track on another person's playlist and select one of your playlists under **Add to Playlist**. Each playlist can contain an upload once. Saved tracks retain their uploader credit and play even if the original playlist is later removed.
- Owners and the existing Vinny admin account can create, edit, reorder, and delete playlists and tracks. A new upload credits the signed-in uploader, including when Vinny manages another user's playlist. Legacy tracks inherit their playlist owner's code because the old format did not record the uploader.
- Drag tracks to reorder, or use Move Up/Move Down in their menu or Alt+Arrow on a focused row. Metadata and order changes use a transaction on the existing playlist, preserving concurrent additions and refusing edits after deletion.
- A single audio element survives screen changes, rooms, profiles, backgrounding and calls. The sidebar and full-width footer control that same player. Shuffle avoids repeats within its cycle; Repeat starts Off for new listeners. The saved Off, All or One setting belongs to the account on this device and persists between sessions. Older valid saved settings are honored. Previous restarts above four seconds; at four seconds or earlier it goes back. Stop clears playback. Volume moves in 5% steps from 0–200% through a Web Audio gain node. While a track loads, a spinner stays beside its title in both controllers.
- Playing chat audio or an unmuted video pauses Music. A connected Spotify playing-state update pauses Music and blocks a new play until Spotify stops. Neither event automatically resumes Music. Spotify detection still depends on the existing Spotify polling/integration; this release does not introduce a new OS media monitor.
- Profiles publish listening state and interpolate elapsed time locally between measured updates, including an elapsed / total label. Seek, play, pause and track changes publish immediately; lease renewal is bounded. Uploaded artwork appears beside the title on the listening profile. Right-click an uploaded playlist or audio cover to download the original image or copy its address. Windows host 2.0.4 enables Repeat for a single upload. The Windows tray uses the same player state, with uploaded artwork, elapsed and total time, seek, transport, volume and Jam controls.

## Starting and joining Jams

1. Play a song, then click the Jam icon to the right of Stop on either Music controller.
2. Other people can open the host's or a listener's Chat App profile and click **Join Jam** beside Play. A join replaces the listener's current track and follows the host's current position, including when paused. Audio starts once the device can load and decode it.
3. The host controls the song, playhead, volume, shuffle and repeat. Listeners can open the library and see the controller. The Jam button shows **Start Jam** during personal playback, **End Jam** for a solo host, and **In Jam With** plus the other participants when sharing. Use the same hover-in and hover-out animation for every tooltip, including rich people lists and message timestamps.
4. Click the Jam control again to confirm **Leave Jam** as a listener or **End Jam** as the host. Switching to another Jam uses the same confirmation. Ending a Jam stops all guest playback. The host can keep listening privately. Losing the host connection ends the Jam.

## RTDB storage and lifecycle

No Music upload calls the B2/Worker, Cloudflare KV, Firebase Storage, or the external attachment provider. Music data is in Realtime Database:

| Path | Content |
| --- | --- |
| `music/playlists/{playlistId}` | Owner, name, cropped icon, creation/update timestamps and compact track metadata |
| `music/playlists/{playlistId}/tracks/{trackId}` | Title, artist, album, cropped icon, duration, order, added time, MIME, file size and blob descriptor |
| `music/playlists/audio:{ownerCode}/uploads/{blobId}` | Standalone upload metadata |
| `music/playlists/{playlistId}/uploads/{blobId}` | Original uploads retained in Audio after removal from that playlist |
| `music/playlistOrder/{ownerCode}` | The library owner's custom playlist order |
| `music/jams/{jamId}` | Host session, current playback clock and participant memberships. The host registers disconnect removal for the Jam. Each guest registers it only for their membership. |
| `music/audio/{blobId}/meta` | Audio descriptor and ownership/cleanup information |
| `music/audio/{blobId}/parts/{sixDigitIndex}` | Independently encoded base64 audio chunks, at most 192 KiB decoded each |
| `users/{code}/musicSessions/{sessionId}` | Ephemeral listening lease; disconnect removal and expiry |

Audio publishes after all chunks are acknowledged. Upload scopes participate in the existing logout, disconnect and update protections. The upload cancels disconnect cleanup before publishing the track metadata. A failed upload cleans up unpublished bytes.

Playlist membership and upload ownership are separate. Removing a track or playlist moves its original upload metadata into the same record's `uploads` map in one transaction. A record containing only `uploads` is private to the catalog implementation and is skipped by playlist listings. Catalog rows use the stable blob ID across playlist removal. Membership copies store `playlistReference`, the uploader code and their unique `referenceKey`.

Each saved copy reserves its key in the blob descriptor before writing the destination playlist. A failed save releases that reservation. Deleting the original from Audio marks the descriptor. Deleting the final saved copy then releases its bytes. A crash between writes can leave an unused reservation or blob. Future storage maintenance must reconcile playlist tracks, retained uploads and active transfers before reclaiming space.

Only metadata is subscribed live. On a cache miss, up to six RTDB part reads run concurrently. Each part is checked against its declared length. Supported MPEG audio and ADTS AAC use MediaSource to decode available parts in order while the rest download. Single-part files, other containers and incompatible streaming decoders use the complete blob. Next-track prefetch and playback share the same download. Cached tracks reuse an object URL without further part reads. The memory cache is bounded and cleared on sign-out. First audible output depends on the connection, codec and device.

## Platform and deployment limits

Audio must be decodable on the listening device. The picker accepts common audio types and detects support/duration before upload; unsupported codecs produce an error. Files are capped at 100 MiB, following the existing app's file ceiling. No arbitrary-format transcoder or paid backend is added. Icons are capped at 6 MiB.

Background playback continues while the app process/browser permits it. Closing or terminating the app, device sleep, mobile OS suspension, browser autoplay policy, audio-device changes, and Windows communication-volume policies cannot be overridden by shared JavaScript. Call start/mute/deafen and ordinary app navigation do not pause Music. No code tries to bypass these OS policies.

Music uses the existing Chat App password/session model. The shared client checks the stable owner account code and the app's existing Vinny admin predicate before library mutations. The Jam player accepts transport changes from its host. The supplied project has no Firebase Authentication integration or deployable RTDB rules that enforce these identities against direct database clients. Production access to Jam records and playlist order depends on the site's existing database permissions.

## Maintenance

`music/data.js` owns library writes, upload scopes, validation, subscriptions and caching. `music/ui.js` owns library views and editors. `music/jams.js` owns membership, host clock publication, disconnect cleanup and leave/end confirmation. `music/player.js` owns the persistent audio element, local media arbitration, clock alignment, profile leases and native bridge. `music/audio-stream.js` owns progressive decoding and `music/artwork.js` owns cover actions and profile artwork. Load those helpers and Jams before the player, followed by the UI, after Spotify and before `core/start`. Keep playback control checks at the player entry points so the Music screen, profile, sidebar, media keys and native tray follow the same host/listener rules.

`window.chatDesktopMusic` is an optional versioned preload bridge. `setMusicState(null)` clears native controls. `onMusicAction` receives only allowlisted commands; native code validates the sender and ignores stale track commands. Older hosts can run shared Music without tray controls. Do not require a native rebuild for ordinary future Music UI changes.

Run `npm run test:music`, `npm test`, `npm run test:browser`, `npm run test:ui-consistency`, `npm --prefix desktop test`, and `npm run audit:upload`. Browser fixtures use an isolated in-memory database, generated WAV audio and the bundled MP3 clip. The MP3 test holds back the final part until Chromium is playing and checks that cached replay requires zero additional part reads. Keep captures outside source. Native tray diagnostics require all three explicit isolation flags documented in `NATIVE-UPDATES.md`. Preserve the public verification key, combined updater, native-first update ordering and existing user-data paths.

Keep cover actions scoped to uploaded raster images and preserve row and card context menus outside the artwork. Music display text uses a compact text-shadow for clickable owner names and player titles and suppresses text selection. Editable fields retain normal text selection, and owned tracks and playlists retain reordering.
