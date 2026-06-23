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

app.post('/parse-task', (req, res) => {
  res.json({ message: 'parse-task stub' })
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