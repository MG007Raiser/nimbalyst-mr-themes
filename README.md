<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/logo-white.svg">
  <img alt="Mr. Themes logo" src="docs/images/logo-black.svg" width="96">
</picture>

# Mr. Themes

**Every project gets its own theme. Best buds with Mr. Projects.**

Visually orient between projects, each with a chosen look. Built for multitasking, visual thinking, flaregremlins. For more goodness, enable [Mr. Projects](https://github.com/Firework-Labs/nimbalyst-mr-projects). An extension for [Nimbalyst](https://nimbalyst.com).

<picture>
  <source media="(prefers-color-scheme: light)" srcset="screenshots/com.fireworklabs.theme-editor-0-light.png">
  <img alt="The Mr. Themes gallery: the theme each project uses, above the theme collection" src="screenshots/com.fireworklabs.theme-editor-0-dark.png">
</picture>

- 120 themes in twenty families, light and dark, all checked for readable contrast, including cream-paper and high-contrast families
- See and change which theme each project uses
- Edit all 75 of the app's colors with a live preview (Nimbalyst's own themes can set 20)
- Share themes as files, or have your agent design a family with the included Family Builder Kit

<img alt="The theme editor reviewing a bright light theme while Nimbalyst wears a dark one" src="screenshots/com.fireworklabs.theme-editor-2-dark.png">

## Install

In Nimbalyst's extension Marketplace, scroll to **Install from GitHub** and paste:

```
https://github.com/MG007Raiser/nimbalyst-mr-themes
```

This is the MG007Raiser fork. It keeps the original extension id, so your collection and settings carry over; uninstall the original first.

## What's new in this fork

- Fourteen more built-in families on top of the original six. Cyberpunk, Cobalt, Garnet, Matcha, Frost (arctic cyan), Nocturne (after-midnight purple), Bramble (retro green), Lavender (soft pastels), Arcade (neon pink), Dusk (sunset orange) and Pine (cool forest) are new in every variation. Parchment and Solar put their light themes on sepia and cream paper. Beacon is high contrast: text at 10:1 or more, accents and code at 7:1, borders at 3:1.
- Families added in an update arrive in your collection once, without bringing back families you deleted.
- The Family Builder Kit CLI runs on Windows and takes `--paper <hue>` and `--contrast high`.

Goes well with [Mr. Projects](https://github.com/Firework-Labs/nimbalyst-mr-projects).

## Good to know

To theme the whole app, Mr. Themes goes a little beyond Nimbalyst's extension API, so a Nimbalyst update can leave a theme half applied until Mr. Themes catches up. Turning it off brings back Nimbalyst's own theme. More in [docs/details.md](docs/details.md).

MIT license.
