# Live Preview Now

gimme live preview

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/5494bd42-64bf-499b-ad60-6fad2ab34725).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Database migrations

**`supabase/migrations` is the single source of truth for the database schema.**
All schema changes (tables, constraints, RLS policies) are applied through
Lovable Cloud's migration tool and live in `supabase/migrations`.

The `drizzle/` directory is **legacy and unused**: it is not wired into the
app (no runtime code imports `drizzle-orm`, `drizzle/schema.ts` is blank, and
no npm scripts run it). Its migration files are out of date — for example,
`drizzle/migrations/0001_create_profile_events.sql` allows only 6 social
platforms and lacks `custom_link_click` events, while the live schema
supports 16 platforms plus custom link clicks. **Do not run the drizzle
migrations against any database.** They are kept for history only.

## Environment variables

This project reads its Supabase connection settings from a `.env` file at the
repo root. `.env` is **not** committed to the repository — copy the provided
`.env.example` to `.env` and fill in your own project's values:

```sh
cp .env.example .env
```

The `SUPABASE_*` / `VITE_SUPABASE_*` values here are publishable (anon) keys
that are safe to expose to the browser, but each project has its own — never
copy them from someone else's project, and never put private keys in `.env`.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
cp .env.example .env   # then fill in your project's values
npm run dev
```
