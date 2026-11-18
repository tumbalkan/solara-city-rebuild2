# Solara City

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/tumbalkan/solara-city-rebuild2/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/tumbalkan/solara-city-rebuild2/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game built for the [make.fun GTA 6 bounty](https://make.fun/bounty/gta6-01). Rico Vega, a driver-for-hire, works five jobs for Mara the fixer across the coastal city of Solara — stealing cars, outrunning the Solara PD, and taking back the bayfront pier.

## Play

```sh
node serve.ts
# open http://localhost:8080
```

Keyboard + mouse, desktop Chrome. Fully offline — every file the game loads is under `game/`.

## What's in the game

- **Open world** — a procedural 7×7 coastal city: ~70 buildings, palm-lined beach, bay, and a wooden pier, all generated from a fixed seed
- **On foot and by car** — third-person walking with sprint, plus six drivable car types with arcade handling (acceleration, steering, drift, handbrake)
- **Traffic and pedestrians** — 14 AI cars following the road graph, 26 sidewalk walkers who flee gunfire and crashes
- **Wanted system** — 1–5 stars; Solara PD interceptors chase and ram, stars decay when you break line of sight
- **Combat** — hitscan pistol with tracers, melee attacks, and five armed gang enemies guarding the pier
- **Missions and story** — five jobs with dialogue, objectives, and payouts: First Wheels, The Package, Heat Wave, The Getaway, Bayfront Showdown
- **HUD** — circular minimap, health, cash, wanted stars, speedometer, ammo, mission tracker
- **Sound** — everything synthesized with the Web Audio API: engine hum, gunshots, sirens, UI
- **Save** — progress (cash, jobs, cars stolen) persists in localStorage

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse | Look / aim |
| Click | Shoot |
| E | Enter / exit car |
| F | Melee |
| Shift | Sprint / handbrake |
| R | Reload |
| Esc | Pause |

## Layout

```
game/
  index.html            page + HUD shell
  vendor/three.module.min.js   three.js 0.187.0 (vendored)
  src/
    main.js             game loop, input, camera, wiring
    city.js             procedural city, road graph, collision
    player.js           Rico on foot
    vehicles.js         car factory + arcade physics
    traffic.js          AI traffic on the road graph
    pedestrians.js      sidewalk walkers + flee behavior
    police.js           wanted stars + chase AI
    combat.js           pistol, melee, gang enemies
    missions.js         five jobs, objectives, dialogue
    hud.js              HUD + minimap canvas
    audio.js            Web Audio synth
    save.js             localStorage progress
main.ts                 entry program: copies game/ + screenshots/ to /output
```

## License

MIT — see [LICENSE](LICENSE). All names, characters, story, and art are original.
