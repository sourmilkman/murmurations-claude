# Murmurations

An ambient, interactive PWA: starling murmurations, a locust swarm, a school of bait fish, smoke from a smouldering leaf pile, and fair-weather clouds — each over swappable photographic environments with generative soundscapes.

**Build:** v0.6.1 · **Live:** https://sourmilkman.github.io/murmurations-claude/

## Behaviour
| Scene | Motion model | Touch / hover |
|---|---|---|
| Starlings | One cohesive, smooth-edged cloud: 7 nearest neighbours (true 3D search) held at a preferred spacing by soft springs (even density + surface tension), rear blind cone, flock-level steering whose turns roll front-to-back as a wave, capped acceleration, thin near-horizontal sheet bent by slow air currents; low swoops are mirrored in the water (water found automatically: pixels whose colour matches the mirrored sky); a peregrine rarely stoops when idle | Predator: fear spreads as dark waves; the flock parts and re-forms |
| Locusts | Rolling swarm in a turbulent wind field with shear; erratic individuals. Left alone it settles onto the ground; after a while birds sweep in and flush it, the take-off rippling outward | Startle burst; tapping a settled swarm flushes it |
| Fish | Huge bait ball alternating between cruising and milling; countershaded fish with silver flashes and self-shadowed core; GPU caustics; a predator patrols when idle | Vacuole + fountain effect around your finger; tap releases bubbles |
| Smoke | Buoyant plumes from five vents, turbulence growing with height, wind shear; embers & sparks at night | Your hand drags air and sheds eddies |
| Clouds | Near-static cumulus, imperceptible drift | Puffs are pushed and torn; they slowly re-form (~30 s) |

**Gather** mode (settings) attracts instead of disturbing.

Starlings, fish and locusts are drawn as *cluster impostors*: each simulated agent renders several followers (≈48k starlings, ≈16k fish, ≈28k locusts on desktop), so density reads like the real thing without a GPU simulation.

## Controls
Keys: `1–5` scenes · `B` background · `M` mute · `F` fullscreen · `H` hide UI · `S` save still.

## Sound
Fully synthesised with Web Audio (no files). To layer real recordings, add `assets/audio/<scene>.mp3` (or `smoke-night.mp3`) and list the file names in `assets/audio/audio.json`.

## Run locally
Serve the folder (e.g. `python -m http.server`) and open `http://localhost:8000`. Opening `index.html` directly works, but offline install and saving stills need http(s).
