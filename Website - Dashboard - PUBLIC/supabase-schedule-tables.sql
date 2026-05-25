-- Schedule / Calendar tables
-- Run in your Supabase SQL editor after supabase-health-tables.sql

CREATE TABLE IF NOT EXISTS events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    text        NOT NULL UNIQUE,
  title        text        NOT NULL,
  description  text,
  date         date        NOT NULL,
  start_time   time,
  end_time     time,
  all_day      boolean     NOT NULL DEFAULT false,
  category     text        NOT NULL DEFAULT 'other',
  recurrence   text,
  recur_end    date,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_goals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text        NOT NULL UNIQUE,
  title         text        NOT NULL,
  scope         text        NOT NULL DEFAULT 'weekly',
  target_date   date,
  target_year   int,
  category      text        NOT NULL DEFAULT 'personal',
  done          boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_preferences (
  id               text        PRIMARY KEY DEFAULT 'default',
  goal_type        text        NOT NULL DEFAULT 'balanced',
  allergies        text[]      DEFAULT '{}',
  exclusions       text[]      DEFAULT '{}',
  cooking_time     text        NOT NULL DEFAULT '30min',
  ingredient_pref  text        NOT NULL DEFAULT 'balanced',
  days             int         NOT NULL DEFAULT 3,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_date   date        NOT NULL,
  days        int         NOT NULL DEFAULT 3,
  goal_type   text        NOT NULL DEFAULT 'balanced',
  meals_json  jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_date   ON events(date);
CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id);
CREATE INDEX IF NOT EXISTS idx_sgoals_scope  ON schedule_goals(scope, target_date);

-- Disable RLS (personal dashboard using service key)
ALTER TABLE events          DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_goals  DISABLE ROW LEVEL SECURITY;
ALTER TABLE food_preferences DISABLE ROW LEVEL SECURITY;
ALTER TABLE food_plans       DISABLE ROW LEVEL SECURITY;
