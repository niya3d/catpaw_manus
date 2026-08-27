# Piece of Niya — Windows Desktop Pet

`Piece of Niya` is a transparent Windows desktop-pet application. Three supplied ceramic cat models move across the desktop and leave soft gray pawprints. Clicking anywhere on the desktop clears a small area of nearby pawprints without blocking normal mouse input.

## Development

Install [Node.js 22](https://nodejs.org/) and run the following commands in this repository.

```bash
npm install
npm run dev
```

The application uses a transparent, always-on-top window. The main process passes clicks from a global mouse listener to the renderer, while the overlay itself remains click-through.

## Windows installer

To create an installer locally on Windows, run:

```bash
npm run dist
```

The output is created under `release/` as `Piece-of-Niya-Setup-<version>.exe`.

Alternatively, create and push a tag such as `v0.1.0`. The included GitHub Actions workflow builds the Windows installer and adds it to the repository release. A manual workflow run produces a downloadable workflow artifact.

## Controls

- **Click anywhere**: Clear a small circle of pawprints around that location.
- **System tray**: Pause or resume the cats, or quit the app.

## Notes

The desktop overlay is intentionally click-through. The global mouse listener is used only to receive click coordinates required to clean pawprints; it does not record, transmit, or save mouse activity.
