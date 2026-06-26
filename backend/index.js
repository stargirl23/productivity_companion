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
      status: 'pending',
      work_url: req.body.workUrl || null
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
const { google } = require('googleapis')

async function createCalendarEvent(accessToken, eventDetails) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  
  const calendar = google.calendar({ version: 'v3', auth })
  
  const event = {
    summary: eventDetails.title,
    description: eventDetails.description || '',
    start: {
      dateTime: eventDetails.start,
      timeZone: 'Asia/Kolkata',
    },
    end: {
      dateTime: eventDetails.end,
      timeZone: 'Asia/Kolkata',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 60 },
      ],
    },
  }
  
  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  })
  
  return response.data
}
app.post('/find-slots', async (req, res) => {
  const { task_id, task, duration_minutes, daily_minutes, execution_type, target_date } = req.body
  
  const userInfo = await getUserFromToken(req)
  if (!userInfo?.sub) return res.status(401).json({ error: 'Unauthorized' })
  
  const authHeader = req.headers.authorization
  const accessToken = authHeader.split(' ')[1]
  
  try {
    // 1. Fetch user availability windows from Supabase
    const { data: prefs } = await supabase
      .from('user_preferences')
      .select('availability_windows')
      .eq('google_id', userInfo.sub)
      .single()
    
    const availabilityWindows = prefs?.availability_windows ?? [
      { start: '06:00', end: '22:00' }
    ]
    
    // 2. Fetch free/busy from Google Calendar
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const calendar = google.calendar({ version: 'v3', auth })
    
    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    const freeBusyRes = await calendar.freebusy.query({
      requestBody: {
        timeMin: now.toISOString(),
        timeMax: sevenDaysLater.toISOString(),
        items: [{ id: 'primary' }]
      }
    })
    
    const busySlots = freeBusyRes.data.calendars.primary.busy ?? []
    
    // 3. Generate candidate slots within availability windows
    const sessionDuration = duration_minutes ?? daily_minutes ?? 60
    const candidateSlots = []
    
    for (let day = 0; day < 7; day++) {
      const date = new Date(now)
      date.setDate(date.getDate() + day)
      const dateStr = date.toISOString().split('T')[0]
      
      for (const window of availabilityWindows) {
        const [startHour, startMin] = window.start.split(':').map(Number)
        const [endHour, endMin] = window.end.split(':').map(Number)
        
        // Generate slots every 30 minutes within window
        let slotStart = new Date(`${dateStr}T${window.start}:00`)
        const windowEnd = new Date(`${dateStr}T${window.end}:00`)
        
        while (slotStart < windowEnd) {
          const slotEnd = new Date(slotStart.getTime() + sessionDuration * 60 * 1000)
          
          if (slotEnd > windowEnd) break
          if (slotStart < now) {
            slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000)
            continue
          }
          
          // Check if slot overlaps with any busy period
          const isConflict = busySlots.some(busy => {
            const busyStart = new Date(busy.start)
            const busyEnd = new Date(busy.end)
            return slotStart < busyEnd && slotEnd > busyStart
          })
          
          if (!isConflict) {
            candidateSlots.push({
              start: slotStart.toISOString(),
              end: slotEnd.toISOString()
            })
          }
          
          slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000)
        }
      }
    }
    
    if (candidateSlots.length === 0) {
      return res.json({ slots: [], message: 'No free slots found in your availability windows' })
    }
    
    // 4. Pass top 10 candidates to Gemini for ranking
    const topCandidates = candidateSlots.slice(0, 10)
    
    const prompt = `You are a scheduling assistant. Pick the best 3 slots for this task.

Task: "${task}"
Duration needed: ${sessionDuration} minutes
Execution type: ${execution_type}
Target date: ${target_date}

Available slots:
${topCandidates.map((s, i) => `${i + 1}. ${new Date(s.start).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} - ${new Date(s.end).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })}`).join('\n')}

Rules:
- Prefer morning slots for focus-heavy tasks (coding, studying, writing)
- Prefer slots not immediately after long gaps (consistency)
- For continuous tasks, prefer same time each day for habit building
- Never pick slots that seem too early (before 6am) or too late (after 10pm)

Respond ONLY in this exact JSON format, no extra text:
{
  "suggestions": [
    { "index": 1, "reason": "Best morning focus window, no meetings nearby" },
    { "index": 2, "reason": "Consistent with typical work pattern" },
    { "index": 3, "reason": "Backup option, slightly later in day" }
  ]
}`

    const raw = await callGemini(prompt)
    const clean = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    
    const recommendedSlots = parsed.suggestions.map(s => ({
      start: topCandidates[s.index - 1].start,
      end: topCandidates[s.index - 1].end,
      reason: s.reason
    }))
    
    res.json({ slots: recommendedSlots })
    
  } catch (err) {
    console.error('/find-slots error:', err)
    res.status(500).json({ error: err.message })
  }
})
app.post('/confirm-task', async (req, res) => {
  const {
    task_id,
    event_time,
    end_time,
    daily_minutes,
    frequency_per_week,
    duration_minutes,
    priority_score,
    title
  } = req.body

  const userInfo = await getUserFromToken(req)
  if (!userInfo?.sub) return res.status(401).json({ error: 'Unauthorized' })

  // Get the access token for calendar
  const authHeader = req.headers.authorization
  const accessToken = authHeader.split(' ')[1]

  try {
    // Update task in Supabase
    const updateData= {
      priority_score,
      updated_at: new Date().toISOString()
    }

    if (event_time) updateData.event_time = event_time
    if (daily_minutes) updateData.daily_minutes = daily_minutes
    if (frequency_per_week) updateData.frequency_per_week = frequency_per_week
    if (duration_minutes) updateData.duration_minutes = duration_minutes

    // Create calendar event
    let calendarEvent = null
    if (event_time && end_time) {
      try {
        calendarEvent = await createCalendarEvent(accessToken, {
          title,
          start: event_time,
          end: end_time,
          description: `Scheduled by Productivity Companion`
        })
        updateData.calendar_event_id = calendarEvent.id
        updateData.status = 'in-progress'
      } catch (calErr) {
        console.error('Calendar error:', calErr)
        // Don't fail the whole request if calendar fails
      }
    }

    // Update Supabase
    const { error: dbError } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', task_id)
      .eq('google_id', userInfo.sub)

    if (dbError) {
      console.error('Supabase update error:', dbError)
      return res.status(500).json({ error: dbError.message })
    }

    res.json({ 
      success: true, 
      calendar_event_id: calendarEvent?.id ?? null,
      calendar_link: calendarEvent?.htmlLink ?? null
    })

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