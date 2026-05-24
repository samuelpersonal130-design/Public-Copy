const { createClient } = require('@supabase/supabase-js')

module.exports = async function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_KEY' })
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('profile')
      .select('age')
      .eq('id', 'default')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ age: data ? data.age : null })
  }

  if (req.method === 'POST') {
    let body = req.body
    if (typeof body === 'string') { try { body = JSON.parse(body) } catch { body = {} } }
    if (!body) body = {}
    const raw = body.age
    const age = raw !== null && raw !== undefined && raw !== '' ? parseInt(raw, 10) || null : null
    const { error } = await supabase
      .from('profile')
      .upsert({ id: 'default', age }, { onConflict: 'id' })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
