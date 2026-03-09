
# Here's My Church

An interactive map of Christian churches in the U.S. Find your church or find a new church. 100% free and crowd-sourced.

[heresmychurch.com](https://heresmychurch.com)

## The Story

I woke up one morning to a text from my best friend with an idea: make a church finder interactive map. I was like... uhhh yes!

Church data is still surprisingly hard to come by. All the current church directories are old and outdated. So this idea felt like it could actually be really helpful — a place where people can find churches while also allowing crowd-sourced info to keep the data as accurate as possible.

What started as a Figma Make project called "Church America Map" turned into **Here's My Church** after the first version got over 10k views, 100+ likes and bookmarks on X, and saw 300 visits on day 1. At that point I had to create a brand and get a domain.

This project is made by me, [Derek Castelli](https://github.com/harvouscom), who's also building [Harvous](https://github.com/harvouscom/harvous) — a Bible notes app.

## What is Here's My Church?

Here's My Church is a free, open-source, interactive map that helps people discover Christian churches across all 50 U.S. states. No account needed.

- **Browse** churches on an interactive U.S. map — click any state to see its churches
- **Search** by church name across states
- **Filter** by denomination (25+), attendance size, and language
- **View** church details like address, website, service times, pastor, ministries, and more
- **Contribute** by adding new churches or suggesting edits to existing ones — all crowd-sourced
- **Bilingual detection** — estimates language offerings based on church name patterns, state demographics, and community confirmations

The goal is simple: make it easy for anyone to find a church near them, with data that's actually up to date.

## Running Locally

```bash
npm i
npm run dev
```

## Tech Stack

**Frontend**
- [React](https://react.dev) 18 — UI framework
- [TypeScript](https://www.typescriptlang.org) — type safety
- [Vite](https://vite.dev) — build tool & dev server
- [React Router](https://reactrouter.com) v7 — URL-driven navigation

**Styling**
- [Tailwind CSS](https://tailwindcss.com) v4 — utility-first CSS
- [shadcn/ui](https://ui.shadcn.com) — component primitives
- [Radix UI](https://www.radix-ui.com) — accessible unstyled components
- [Lucide](https://lucide.dev) — icons
- [Motion](https://motion.dev) — animations

**Mapping**
- [react-simple-maps](https://www.react-simple-maps.io) — D3-based map rendering
- [d3-geo](https://d3js.org/d3-geo) — geographic projections
- [TopoJSON](https://github.com/topojson/topojson) — geographic data format

**Backend**
- [Supabase](https://supabase.com) — serverless functions & database
- [Hono](https://hono.dev) — lightweight HTTP framework for edge functions

**Data Sources**
- OpenStreetMap church data with denomination matching
- ARDA (Association of Religion Data Archives) reference data
- U.S. Census population data
- Community-submitted churches and corrections

## Credits

- [shadcn/ui](https://ui.shadcn.com) — MIT licensed component library
- [Unsplash](https://unsplash.com) — photos used under [Unsplash license](https://unsplash.com/license)
- Originally built with [Figma Make](https://www.figma.com/make) — the [original project](https://www.figma.com/design/DDx89YVARqkAInuPhDGvFY/Here-s-My-Church)

## License

Open source. Feel free to contribute, open issues, or submit pull requests.
