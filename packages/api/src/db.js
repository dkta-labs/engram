import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
})

export default sql
