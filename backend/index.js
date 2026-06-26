require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
const app = express()
app.use(cors())
app.use(express.json())

const GEMINI_API_KEY = process.env.GEMINI_API_KEY

async function callGemini(prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  )
  const data = await response.json()
  console.log('Gemini raw response:', JSON.stringify(data))
  
  if (!data.candidates) {
    throw new Error(JSON.stringify(data))
  }
  
  return data.candidates[0].content.parts[0].text
}
const { OAuth2Client } = require('google-auth-library')
const client = new OAuth2Client()

async function getUserFromToken(req) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return null
  
  const token = authHeader.split(' ')[1]
  
  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const userInfo = await response.json()
    return userInfo // contains sub (Google user ID), email, name
  } catch {
    return null
  }
}
app.get('/', (req, res) => {
  res.json({ status: 'ok' })
})
app.get('/preferences', async (req, res) => {
  const userInfo = await getUserFromToken(req)
  if (!userInfo?.sub) return res.status(401).json({ error: 'Unauthorized' })

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('google_id', userInfo.sub)
    .single()

  if (error || !data) return res.json({ exists: false })
  res.json({ exists: true, ...data })
})

app.post('/preferences', async (req, res) => {
  const { availability_windows, distraction_sites } = req.body
  const userInfo = await getUserFromToken(req)
  if (!userInfo?.sub) return res.status(401).json({ error: 'Unauthorized' })

  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      google_id: userInfo.sub,
      user_email: userInfo.email,
      availability_windows,
      distraction_sites,
      updated_at: new Date().toISOString()
    }, { onConflict: 'google_id' })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ success: true })
})
app.post('/parse-task', async (req, res) => {
  const { task, targetDate } = req.body

  if (!task || !targetDate) {
    return res.status(400).json({ error: 'Task and targetDate are required' })
  }

  const today = new Date().toISOString()
  const daysUntilDeadline = Math.ceil((new Date(targetDate) - new Date()) / (1000 * 60 * 60 * 24))

  const prompt = `You are a productivity strategist. Your job is to create a specific, actionable plan — not a generic schedule.

Task: "${task}"
Target Date: "${targetDate}"
Today: "${today}"
Days available: ${daysUntilDeadline}

First, silently classify this task as one of:
- "project": Has multiple distinct phases (research, build, review)
- "learning": Requires building a skill over time
- "application": A submission with specific components (resume, cover letter, etc.)
- "other": Anything else

Then generate a plan that fits the task type. Rules:
- For "project": Break into phases, not days. Each phase has a clear output.
- For "learning": Define what "done" looks like first. Then suggest a practice pattern, not a rigid schedule.
- For "application": List the exact components needed and the order to tackle them.
- For "other": Use your best judgment.

NEVER output generic advice like "stay focused" or "take breaks."
EVERY micro_task must be specific to THIS task, not reusable for any other task.

Respond ONLY in this exact JSON format, no extra text, no markdown:
{
  "task_type": "project | learning | application | other",
  "finish_line": "One sentence: what does 100% done look like for this specific task?",
  "biggest_risk": "The single most likely reason THIS specific task won't get done",
  "first_action": "The most specific next action (not 'start working', but exactly what to open, write, or do)",
  "phases": [
    {
      "name": "Phase name",
      "goal": "The concrete output of this phase",
      "steps": ["Specific step 1", "Specific step 2"]
    }
  ],
  "schedule_suggestion": {
    "first_step_deadline": "ISO date by when the first phase should be done",
    "suggested_daily_minutes": 60
  }
}`

  try {
    const raw = await callGemini(prompt)
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    const battlePlan = `🏁 DONE LOOKS LIKE\n${parsed.finish_line}\n\n⚠️ BIGGEST RISK\n${parsed.biggest_risk}\n\n⚡ DO THIS FIRST\n${parsed.first_action}\n\n📋 YOUR PLAN\n${parsed.phases.map((p, i) => `${i + 1}. ${p.name}\n   Goal: ${p.goal}\n${p.steps.map(s => `   • ${s}`).join('\n')}`).join('\n\n')}`

    res.json({
      battlePlan,
      raw: parsed,
      scheduleFirstStep: {
        task: parsed.phases[0]?.steps[0] ?? task,
        targetDate: parsed.schedule_suggestion.first_step_deadline,
        suggested_daily_minutes: parsed.schedule_suggestion.suggested_daily_minutes
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
app.post('/classify-intent', async (req, res) => {
  const { task, targetDate } = req.body

  if (!task || !targetDate) {
    return res.status(400).json({ error: 'Task and targetDate are required' })
  }

  const today = new Date().toISOString()

  const prompt = `You are a task classification engine. Analyze the task and respond ONLY in JSON.

Task: "${task}"
Target Date: "${targetDate}"
Today: "${today}"

Classify into exactly one execution_type:
- "explicit": Has a specific time embedded (meeting, interview, appointment, class)
- "one-off": Single finite action before target date (pay bill, submit form, send email)
- "continuous": Requires repeated effort over time (learn X, build X, practice X, prepare for X)

Also infer:
- priority_score (1-5):
  1 = Critical (interview, exam, legal deadline, payment)
  2 = High (important application, project milestone)
  3 = Medium (standard task)
  4 = Low (plenty of time, low stakes)
  5 = Backburner (someday/maybe)

- For "explicit": extract event_time (ISO string)
- For "one-off": estimate duration_minutes needed
- For "continuous": suggest daily_minutes and frequency_per_week

Respond ONLY in this exact JSON format, no extra text, no markdown:
{
  "execution_type": "explicit | one-off | continuous",
  "priority_score": 1,
  "priority_reason": "one sentence why",
  "event_time": null,
  "duration_minutes": null,
  "daily_minutes": null,
  "frequency_per_week": null
}`

  try {
    const raw = await callGemini(prompt)
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    // Get user from token
    const userInfo = await getUserFromToken(req)

    // Save to Supabase if user is authenticated
   if (userInfo?.sub) {
  const { data: insertedTask, error: dbError } = await supabase
    .from('tasks')
    .insert({
      google_id: userInfo.sub,
      user_email: userInfo.email,
      title: task,
      target_date: targetDate,
      execution_type: parsed.execution_type,
      priority_score: parsed.priority_score,
      status: 'pending'
    })
    .select('id')
    .single()

  if (dbError) {
    console.error('Supabase insert error:', dbError)
  } else {
    parsed.task_id = insertedTask.id
  }
}
    res.json(parsed)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
app.post('/get-advice', (req, res) => {
  res.json({ message: 'get-advice stub' })
})

app.get('/test-gemini', async (req, res) => {
  try {
    const result = await callGemini('Say hello in exactly 5 words.')
    res.json({ success: true, response: result })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))