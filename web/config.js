// Change this to your own GitHub "username/repo" after you fork or push the project.
// The download buttons point at the newest GitHub Release of this repo.
window.TALLY_CONFIG = {
  repo: 'StaticYolt/tally',

  // File names produced by electron-builder (see "artifactName" in package.json).
  // They don't include the version number, so /releases/latest/download/<name>
  // always points at the newest build.
  assets: {
    windows: 'Tally-Windows-Setup.exe',
    mac: 'Tally-macOS.dmg',
    linux: 'Tally-Linux.AppImage',
    'linux-deb': 'Tally-Linux.deb',
  },
};
