# Rally X — The Neon Gardens

A modern, independently made arcade maze chase inspired by the spirit of New Rally-X. All graphics and the **Midnight Detour** soundtrack are original, drawn and synthesized in the browser. No game assets, recordings, or melodies from the original are used.

**[Play online](https://wolfxxx.github.io/rally/)**

## Play locally

Requires Node.js 18 or later. No installation or dependencies needed.

```sh
npm start
```

Open **http://127.0.0.1:4317**, then choose **Start engine**. Browsers require this interaction before playing audio. Set `PORT` to choose a different server port.

## Controls

| Action | Input |
| --- | --- |
| Steer | Arrow keys or WASD; touch direction pad on mobile |
| Drop smoke | Space or touch smoke button |
| Pause / resume | P or Escape |
| Mute / unmute | M or Sound button |
| Start / continue | Enter |

The car moves continuously. Queue a turn before an intersection; reverse at any time. Collect all ten flags to advance. The purple S flag doubles subsequent flag points, including itself. Green fuel cans restore 30% fuel. Smoke costs 4% fuel, lasts three seconds, and stuns red pursuers. Orange striped roadblocks and moving pursuers cost a life. Each run has three lives; collected flags and score survive a crash. Remaining fuel earns a bonus at the end of each round. Further rounds have new layouts and faster pursuers. The radar shows the full neighborhood, flags, fuel, and enemies.

Best score and sound preference are saved locally when browser storage is available. Play pauses when the window loses focus. Google Fonts are an optional visual enhancement; the game and music work offline with system font fallbacks once served locally.

## Development

Plain HTML, CSS, ES modules, Canvas 2D, and Web Audio. No build step.

- `src/world.js` — seeded maze generation, connectivity, and grid movement
- `src/game.js` — simulation, rendering, enemy behavior, input, UI
- `src/audio.js` — original 16-bar chiptune and synthesized effects
- `style.css` — responsive arcade shell and touch controls
- `server.mjs` — local static server bound to loopback

```sh
npm test
npm run check
```

Tests verify obstacle-safe connectivity and pickup reachability across 100 rounds, deterministic generation, wall collisions, buffered turns, and mid-road reversals.

## GitHub Pages

Pushing to `main` runs syntax checks and tests, then deploys the static game to **https://wolfxxx.github.io/rally/** using `.github/workflows/pages.yml`. The repository’s Pages source is GitHub Actions. Only the HTML, stylesheet, favicon, and game modules are included in the deployed site; no server is needed.

This is a fan-inspired original project, not an official release or an affiliation with the original game’s creators.
