# Original character and rifle: provenance and checks (Claude 2)

**Assignment:** a human-assigned visual upgrade of the hillside showcase.

**Design:** original, by the human's choice. A Marshmello likeness and a copy of Fortnite's 2019 Hunting Rifle were declined because they would recreate a real artist's branded persona and a specific game asset. This is not a recreation of either.

## Asset provenance
- **Everything is authored in code** from three.js primitives: RoundedBox, Capsule, Sphere, Cylinder, Cone and Icosahedron.
- **No downloads:** no textures, models or asset packs were downloaded, and no game files were extracted.
- **Colours are chosen by eye** to sit in the existing cyan-graded scene:
  - Suit: off-white `#eceef0`
  - Pack: purple `#a24bd0`, a warmer purple so it still reads purple under the cyan light
  - Accent: muted green `#5aa84a`
- **References:** the reference clip shows only a stylized third-person shooter with a rifle over the right shoulder. Everything else is an estimate:
  - Proportions are stylized at about 1.9 m tall.
  - The torso is turned about 34° for the rifle stance.
  - The rifle is about 1.2 m long.

## Screenshots (local production server, Chrome, hardware WebGL)
- `before-spawn.jpg`: the previous cyan mannequin (live `3bf1ae5`).
- `after-spawn.jpg`: the new character at spawn, same framing.
- `after-closeup.png`: close-up of the helmet, pack, arms and rifle.

## Known differences and limitations
- From the over-the-shoulder camera the rifle is mostly hidden behind the right arm. The muzzle and forend show past the shoulder.
- Hand placement is verified numerically, by IK tests at every pose, not visually from the front, because the game camera never faces the character.
- The muzzle flash (55 ms) is too brief to catch in a screenshot; its timing is unit-tested.
- Real pointer-lock mouse look and click-to-fire could not be exercised in the automation browser, which refuses pointer lock. Keyboard look and F-to-fire were tested.
