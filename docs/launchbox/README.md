# LaunchBox / Big Box media

Media for the Vermilion cabinet's LaunchBox "Arcade" platform, made from the game itself by
`node scripts/launchbox-media.mjs` (default: the `latest` release the cabinet runs; `--ref .` for this checkout,
`--art-only` to recompose the logo and posters from the screenshots here). `SOURCE.txt` names the captured commit.

The folders mirror LaunchBox's own, and files are named `<Title>-01` so LaunchBox matches them to the game.
To install or restore, close LaunchBox and Big Box, then copy `Images/` and `Videos/` over
`C:\Users\arcade\LaunchBox\` (this tree is the backup; the cabinet's collector does not archive media).
