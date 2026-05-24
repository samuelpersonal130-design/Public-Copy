const { createClient } = require('@supabase/supabase-js')

const ALLOWED = ['events', 'schedule_goals', 'food_preferences', 'food_plans']

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env vars' })
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  // GET /api/events?table=events[&from=YYYY-MM-DD&to=YYYY-MM-DD]
  if (req.method === 'GET') {
    const table = req.query.table || 'events'
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' })
    let q = supabase.from(table).select('*')
    if (table === 'events') {
      if (req.query.from) q = q.gte('date', req.query.from)
      if (req.query.to)   q = q.lte('date', req.query.to)
      q = q.order('date').order('start_time')
    } else {
      q = q.order('created_at', { ascending: false })
    }
    const { data, error } = await q
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ data })
  }

  // POST — upsert by client_id
  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    body = body || {}
    const table = body.table || 'events'
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' })
    const row = body.row
    if (!row) return res.status(400).json({ error: 'Missing row' })
    const conflictCol = table === 'food_preferences' ? 'id' : 'client_id'
    const { data, error } = await supabase.from(table).upsert(row, { onConflict: conflictCol }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ data })
  }

  // PUT — update by client_id
  if (req.method === 'PUT') {
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    body = body || {}
    const table = body.table || 'events'
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' })
    const { client_id, ...updates } = body.row || {}
    if (!client_id) return res.status(400).json({ error: 'Missing client_id' })
    updates.updated_at = new Date().toISOString()
    const { error } = await supabase.from(table).update(updates).eq('client_id', client_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // DELETE — by client_id
  if (req.method === 'DELETE') {
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    body = body || {}
    const table = body.table || 'events'
    if (!ALLOWED.includes(table)) return res.status(400).json({ error: 'Invalid table' })
    const client_id = body.client_id
    if (!client_id) return res.status(400).json({ error: 'Missing client_id' })
    const { error } = await supabase.from(table).delete().eq('client_id', client_id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
