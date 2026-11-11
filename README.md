# Clip Cutter

A local web app for cutting social-ready clips out of long videos with FFmpeg.
Nothing is uploaded anywhere: the app runs on your machine and only answers to `127.0.0.1`.

## Run it (Windows)

1. Install **Node.js 20.9 or newer** (LTS) from https://nodejs.org
2. Double-click **`start.bat`**. First run installs and builds (about a minute); after that it starts in seconds
   and opens http://127.0.0.1:3000

Or from a terminal: `npm install`, `npm run build`, `npm start`  (or `npm run dev` while editing the code).

## Use it

1. **Pick a video.** Drop files into the `videos` folder, or paste a full path.
2. **Mark clips.** Play, press `I` at the start, `O` at the end, `A` to add. Or edit the times in the list,
   or paste an existing `clips.txt` list under *Import*. Your clip list is remembered per video.
3. **Choose formats** (original, vertical blur, vertical crop, square) and quality, then **Render**.
   Clips land in `clips/<video name>/<format>/`.

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `I` / `O` | Set start / end at the playhead |
| `A` | Add the clip |
| `←` `→` | Seek 1 s (hold Shift for 5 s) |
| `,` `.` | Step one frame back / forward |

## Settings (`.env.local`)

| Variable | Meaning |
| --- | --- |
| `FFMPEG_PATH` | Full path to `ffmpeg.exe` (falls back to `ffmpeg` on your PATH). `ffprobe.exe` must sit next to it. |
| `VIDEOS_DIR` | Folder the picker lists (default `./videos`) |
| `OUTPUT_DIR` | Where clips are written (default `./clips`) |

Restart the app after editing this file.

## Notes

- **Preview vs. render:** the in-browser preview depends on your browser's codecs. H.264 MP4 is ideal.
  HEVC or MKV files may not preview, but they still render fine: type the times in the list.
- **Quality:** *Balanced* is x264 `medium`, CRF 18. *Best* is `slow`, CRF 16. A GPU encoder is only auto-picked
  for *Fast*, because x264 gives better quality per MB. You can force one under *Advanced*.
- **Speed:** several clips render at once, the start of each clip is found by instant seeking, and the
  blurred-background format blurs at 1/8 size and scales up.
- **Safety:** files are written as `.part` and renamed only when complete. The server rejects requests whose Host header isn't
  localhost, and only serves finished clips from the output folder. Don't expose the port to a network.
- After changing the code, run `npm run build` again before `start.bat`.

## Layout

```
app/              UI (page.tsx) + API routes (app/api/*)
components/       Player, ClipList, RenderPanel, JobView, SourcePicker
lib/ffmpeg.ts     FFmpeg arguments, probing, encoder detection
lib/jobs.ts       Parallel render queue, progress, cancel
```
