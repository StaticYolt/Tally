# Tally

A small screen recorder that ships two ways from one codebase:

- **Website** on GitHub Pages: record in the browser, download the video.
- **Desktop app** (Windows, macOS, Linux) built with Electron: same UI, plus a source picker with thumbnails and a native "Save as" dialog.

The website has a download section that links to the latest desktop build for each OS.

## How it fits together

```
web/                 ← the app. Deployed to GitHub Pages AND bundled into Electron
  index.html
  style.css
  app.js             ← recorder logic; checks window.electronAPI for desktop extras
  config.js          ← your GitHub repo name + installer file names
main.js              ← Electron main process (window, screen sources, saving files)
preload.js           ← exposes window.electronAPI to the page (desktop only)
build/icon.png       ← app icon used for the installers
.github/workflows/
  pages.yml          ← push to main → website deployed
  release.yml        ← push a v* tag → installers built and attached to a Release
```

`app.js` runs in both places. When it needs something only Electron can do, it checks for `window.electronAPI`:

| Step | Website | Desktop app |
|---|---|---|
| Pick a screen | Browser's built-in picker (`getDisplayMedia`) | Tally's own picker with thumbnails (`desktopCapturer` in `main.js`) |
| Record | `MediaRecorder` | `MediaRecorder` (same code) |
| Save | File downloads | Native "Save as" dialog, written with Node's `fs` |
| Download section | Shown | Hidden |

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm start        # opens the desktop app
npm run web      # serves the website at http://localhost:3000
```

Screen capture in the browser only works on `localhost` or over HTTPS, which is why `npm run web` uses a local server instead of opening the file directly.

## Put it on GitHub

1. Create a repo called `tally` (or anything else) and push this folder to its `main` branch.
2. In `web/config.js`, set `repo` to `your-username/your-repo`. Also update `homepage` and `author` in `package.json`.
3. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**. The next push to `main` deploys the site to `https://your-username.github.io/your-repo/`.

## Publish the desktop app

Bump the version and push the tag it creates:

```bash
npm version patch      # 1.0.0 → 1.0.1, commits and tags v1.0.1
git push --follow-tags
```

The **Build desktop apps** workflow builds on Windows, macOS and Linux runners (about 10 minutes), then creates a Release with:

- `Tally-Windows-Setup.exe`
- `Tally-macOS.dmg` (universal: Apple silicon and Intel)
- `Tally-Linux.AppImage` and `Tally-Linux.deb`

The file names have no version number in them, so the website links (`/releases/latest/download/<file>`) always get the newest build.

To build only for your own OS without GitHub: `npm run dist`, output goes to `dist/`.

## Unsigned builds

The installers aren't code-signed, so first launch shows a warning:

- **Windows:** SmartScreen says "Windows protected your PC". Click **More info → Run anyway**.
- **macOS:** right-click the app → **Open**. If macOS says the app is "damaged", run `xattr -cr /Applications/Tally.app` in Terminal. macOS will also ask for Screen Recording permission in System Settings → Privacy & Security the first time you record.

Removing the warnings needs a Windows code-signing certificate and an Apple Developer account ($99/year) for signing and notarization. electron-builder supports both through environment variables in the release workflow.

## Load the live site instead of the bundled copy

`main.js` loads the bundled `web/` folder so the app works offline. To have the app always show whatever is live on GitHub Pages, replace the `loadFile` line with:

```js
win.loadURL('https://your-username.github.io/your-repo/');
```

The trade-off: website updates reach the app immediately, but the app needs internet to start.
# Tally
