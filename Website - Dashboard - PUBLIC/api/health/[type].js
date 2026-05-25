const { createClient } = require('@supabase/supabase-js')

const TABLE_MAP = {
  heartrate:        'heart_rate',
  steps:            'steps',
  calories:         'calories',
  sleep:            'sleep',
  height:           'height',
  weight:           'weight',
  oxygensaturation: 'oxygen_saturation',
  exercise:         'exercise',
  sleepstage:       'sleep_stage',
  nutrition:        'nutrition',
  mindfulness:      'mindfulness',
  hrv:              'hrv',
  skintemperature:  'skin_temperature',
  respiratoryrate:  'respiratory_rate',
  floorsclimbed:    'floors_climbed',
  hydration:        'hydration',
  totalcalories:    'total_calories',
  basalmetabolicrate: 'basal_metabolic_rate',
  bodyfat:          'body_fat',
  distance:         'distance',
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const type = req.query.type
  const table = TABLE_MAP[type]
  if (!table) return res.status(404).json({ error: 'Unknown health metric: ' + type })

  // Parse body manually if Vercel didn't auto-parse it (e.g. missing Content-Type header)
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = { raw: body } }
  }
  if (body === undefined || body === null) body = {}

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_KEY' })
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    const { error } = await supabase.from(table).insert({ data: body })
    if (error) throw error
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[' + table + ']', err)
    res.status(500).json({ error: err.message || String(err) })
  }
}
