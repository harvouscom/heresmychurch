
# Here's My Church

An interactive map of Christian churches in the U.S. — find your church or find a new one. Free, open-source, crowd-sourced, no account needed. **[heresmychurch.com](https://heresmychurch.com)**

## The Story

I woke up one morning to a text from my best friend with an idea: make a church finder interactive map. I was like... uhhh yes!

Church data is surprisingly hard to come by; most directories are old and outdated. This felt like a chance to help — a place to find churches where crowd-sourced updates keep the data accurate.

What started as a Figma Make project called "Church America Map" became **Here's My Church** after the first version got 10k+ views, 100+ likes/bookmarks on X, and 300 visits on day 1. That’s when I created the brand and got a domain.

By [Derek Castelli](https://github.com/harvouscom), who’s also building [Harvous](https://github.com/harvouscom/harvous) — a Bible notes app.

## What it does

- **Browse** — click any state to see its churches on the map
- **Search** by name across states; **filter** by denomination (25+), size, and language
- **View** details: address, website, service times, pastor, ministries
- **Contribute** — add churches or suggest edits (crowd-sourced)
- **Bilingual detection** — estimates language from name patterns, demographics, and confirmations

Goal: make it easy to find a church near you with data that’s actually up to date.

For how the app is wired (routing, data flow, API, deployment): **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. New to React? Start with **[docs/LEARNING-REACT-IN-THIS-APP.md](docs/LEARNING-REACT-IN-THIS-APP.md)**.

## Tech Stack

**Frontend:** [React](https://react.dev) 18, [TypeScript](https://www.typescriptlang.org), [Vite](https://vite.dev), [React Router](https://reactrouter.com) v7 · **Styling:** [Tailwind](https://tailwindcss.com) v4, [shadcn/ui](https://ui.shadcn.com), [Radix](https://www.radix-ui.com), [Lucide](https://lucide.dev), [Motion](https://motion.dev) · **Mapping:** [react-simple-maps](https://www.react-simple-maps.io), [d3-geo](https://d3js.org/d3-geo), [TopoJSON](https://github.com/topojson/topojson) · **Backend:** [Supabase](https://supabase.com), [Hono](https://hono.dev)

**Data:** OpenStreetMap (churches, denomination matching, building footprints); ARDA (attendance estimates); U.S. Census (state/county population); community submissions. To refresh population data: `node scripts/generate-state-populations.mjs` then redeploy Supabase functions.

## Credits

- [shadcn/ui](https://ui.shadcn.com) — MIT licensed component library
- Originally built with [Figma Make](https://www.figma.com/make) — the [original project](https://www.figma.com/design/DDx89YVARqkAInuPhDGvFY/Here-s-My-Church)

## Changelog

See **[CHANGELOG.md](CHANGELOG.md)** for version history and release notes. Project start (1.0): **2026-03-09**. Current version: **1.110.0**.

## License

This project is open source under the **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** license. See [LICENSE](LICENSE) for the full text. You may use, modify, and share the code with attribution, but **not for commercial use** (you may not use it primarily to make money). [Summary of the license](https://creativecommons.org/licenses/by-nc/4.0/).
