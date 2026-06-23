const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ status: 'ok' })
})

app.post('/parse-task', (req, res) => {
  res.json({ message: 'parse-task stub' })
})

app.post('/get-advice', (req, res) => {
  res.json({ message: 'get-advice stub' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))