# Industrial Automation System

Interactive shop-floor workspace for environment setup, layout configuration, and manufacturing simulation.

**Repository:** [https://github.com/SyedHilalHussain/Industrial_automation_system](https://github.com/SyedHilalHussain/Industrial_automation_system)

## Features

- Environment initialization and shop topology configuration
- Drag-and-drop layout editor for shop stations
- Real-time simulation with buffers, cycle times, and part flow visualization

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (LTS recommended)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build for production

```bash
npm install
npm run build
```

Output is written to `dist/`. Deploy the contents of `dist/` to your web server (not the full source tree).

## Deploy on IIS (subfolder)

This project is configured for a subdirectory base path (e.g. `https://yourdomain.com/industrial_auto/`).

1. Set `base` in `vite.config.ts` to match your folder name (default: `/industrial_auto/`).
2. Run `npm run build` on your machine or the server.
3. Copy everything inside `dist/` into the IIS folder (e.g. `C:\inetpub\wwwroot\yourdomain.com\industrial_auto\`).
4. Ensure `web.config` is present (included via `public/web.config`).
5. Install [IIS URL Rewrite](https://www.iis.net/downloads/microsoft/url-rewrite) if SPA routing is required.

## Environment variables

Copy `.env.example` to `.env` or `.env.local` only if you add server-side features later. The current app runs as a static React SPA and does not call external APIs at runtime.

**Do not commit `.env` files** — they are listed in `.gitignore`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | TypeScript check |

## License

Apache-2.0 (see source file headers).
