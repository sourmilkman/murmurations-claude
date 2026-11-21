# Murmurations

An ambient, interactive PWA: starling murmurations, a locust swarm, a school of bait fish, smoke from a smouldering leaf pile, and fair-weather clouds — each over swappable photographic environments with generative soundscapes.

**Build:** v0.1.0 · **Live:** https://sourmilkman.github.io/murmurations-claude/

## Behaviour
| Scene | Motion model | Touch / hover |
|---|---|---|
| Starlings | 3D boids, ~7–9 neighbour cap, fear contagion → dark density waves; a peregrine stoops when idle | Predator: flock splits, waves ripple through, re-forms |
| Locusts | Wind-borne stream in a turbulent curl-noise field, erratic individual flight, deep perspective with defocused foreground | Startle burst, then drift back into the stream |
| Fish | Tight polarised school; silver flash on turns; a predator patrols when idle | Vacuole + fountain effect around your finger; tap releases bubbles |
| Smoke | Buoyant plumes from five vents, turbulence growing with height, wind shear; embers & sparks at night | Your hand drags air and sheds eddies |
| Clouds | Near-static cumulus, imperceptible drift | Puffs are pushed and torn; they slowly re-form (~30 s) |

**Gather** mode (settings) attracts instead of disturbing.

## Controls
Keys: `1–5` scenes · `B` background · `M` mute · `F` fullscreen · `H` hide UI · `S` save still.

## Sound
Fully synthesised with Web Audio (no files). To layer real recordings, add `assets/audio/<scene>.mp3` (or `smoke-night.mp3`) and list the file names in `assets/audio/audio.json`.

## Run locally
Serve the folder (e.g. `python -m http.server`) and open `http://localhost:8000`. Opening `index.html` directly works, but offline install and saving stills need http(s).
