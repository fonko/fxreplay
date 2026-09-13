Use this skill whenever building or styling UI components, pages, or layouts.

# FX Replay Brand Kit Guidelines

## 1. Design Tokens Integration
- CSS tokens are located at `src/styles/tokens.css`.
- Always use semantic CSS variables (e.g., `var(--bg-primary)`, `var(--text-primary)`, `var(--border-brand)`).
- **NEVER** hardcode raw HEX values or use unmapped colors.

## 2. Color Palette Highlights
- **Brand Primary:** `#0260FD` (Electric Blue) -> `--border-brand`
- **Ground / Dark:** `#030303` (`dark-900`) -> Primary background
- **Card Background Translucent:** `color-mix(in srgb, var(--dark-900) 60%, transparent)`

## 3. Typography
- **Headings:** `Lato` (Weights: 400, 700, 900)
- **Body & UI:** `Nunito Sans` (Weights: 400, 600, 700)

## 4. Brand Logos & Assets
- Logos are located in `public/logos/`:
  - `FXReplayLogo.svg` (Primary wordmark)
  - `isotypeBlack.svg` (Dark play icon for light backgrounds)
  - `isotypeWhite.svg` (White play icon for dark backgrounds)