import hotel from './src/hotel.js'
import { door } from './src/back/door.js'
import './src/back/ws.js'
import g from './src/g.js'
import { setDoorCreationQueries } from './src/back/createTables.js'
import { db } from './src/back/db.js'

hotel(door)

for (let k in g.desc) {
  // resolve descriptions
  g.desc[k] = g.desc[k]()

  setDoorCreationQueries(k)
}

const sql = await db()

g.queries.createTable.forEach((q) => sql(q))
