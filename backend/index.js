require('dotenv').config()
const express = require('express')
const cors = require('cors')

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

app.get('/', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/parse-task', async (req, res) => {
  const { task, deadline } = req.body

  if (!task || !deadline) {
    return res.status(400).json({ error: 'Task and deadline are required' })
  }

  const prompt = `You are a productivity strategist helping someone beat procrastination and hit their deadline.

Task: ${task}
Deadline: ${deadline}

Respond ONLY in this exact JSON format, no extra text:
{
  "risk": "The single biggest reason this deadline might be missed (1 sentence)",
  "daily_plan": [
    { "day": "Day 1", "focus": "...", "micro_tasks": ["15-min task", "15-min task"] }
  ],
  "first_action": "The one specific thing they can do in the next 10 minutes RIGHT NOW",
  "energy_tip": "Best time of day to work on this and why (1 sentence)"
}`

  try {
    const raw = await callGemini(prompt)
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    const battlePlan = `⚠️ BIGGEST RISK\n${parsed.risk}\n\n⚡ DO THIS NOW (10 min)\n${parsed.first_action}\n\n📅 YOUR PLAN\n${parsed.daily_plan.map(d => `${d.day}: ${d.focus}\n${d.micro_tasks.map(t => `  • ${t}`).join('\n')}`).join('\n\n')}\n\n💡 ENERGY TIP\n${parsed.energy_tip}`

    res.json({ battlePlan })
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