-- Health Connect tables
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS heart_rate (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS steps (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sleep (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS height (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS weight (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oxygen_saturation (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercise (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sleep_stage (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nutrition (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mindfulness (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hrv (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skin_temperature (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS respiratory_rate (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS floors_climbed (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hydration (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS total_calories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS basal_metabolic_rate (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS body_fat (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS distance (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- User profile (single-row, key = 'default')
CREATE TABLE IF NOT EXISTS profile (
  id         text        PRIMARY KEY DEFAULT 'default',
  age        int,
  updated_at timestamptz NOT NULL DEFAULT now()
);
