const { createClient } = require('@supabase/supabase-js')

function createHandler(table) {
  return async function (req, res) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      )
      const { error } = await supabase.from(table).insert({ data: req.body })
      if (error) throw error
      res.status(200).json({ ok: true })
    } catch (err) {
      console.error(`[${table}]`, err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}

module.exports = { createHandler }
