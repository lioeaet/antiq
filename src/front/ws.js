import g, { openingPromiseResolver } from '../g.js'
import { filterObj, copy } from '../utils.js'
import { door } from './door.js'
import { putFromResults, rerenderBounded } from './put.js'
const ws = new WebSocket('ws://localhost:4387')

let guest

// структура запроса
// {
//   t: 'get',
//   a: [name, id],
//   i: id,
// }

// структура ответа

let wsLogs = {}

export function open(hotel) {
  // ws.onopen = (e) => {
  // }

  // guest при открытии
  // передаём с каждым ивентом
  // на сервере записываем все используемые guest-normId
  // на сеттеры смотрим, какие guest на них подписаны, отправляем их туда

  ws.onmessage = async (msg) => {
    const event = JSON.parse(msg.data)

    if (event.t === 'open') {
      g.opened = true
      guest = event.guest
      openingPromiseResolver.exec()
      return
    }

    if (g.listner[event.id]) {
      await g.listner[event.id](event)
      delete g.listner[event.id]
    }

    if (event.t === 'put') {
      g.currentEvent = { results: [event.diff] }
      putFromResults(event.doorName, 0)
      // ...rerenderBounded
    }
  }

  ws.onclose = () => ws.close('"hard close"')

  window.onbeforeunload = function () {
    ws.onclose = function () {} // disable onclose handler first
    ws.close('"hard close"')
  }

  hotel(door)

  for (let key in g.desc) {
    g.desc[key] = g.desc[key]()
  }

  const doors = {}
  for (let k in g.door) {
    // сделать все _ в upperCase
    doors[`${k}D`] = g.door[k]
  }

  return doors
}

export async function sendEvent({ event, onSuccess }) {
  if (!guest) await openingPromiseResolver

  event.guest = guest

  const msg = filterObj(event, 'count', 'parent', 'results')

  if (wsLogs) wsLogs[event.id] = { front: msg }
  ws.send(JSON.stringify(filterObj(event, 'count', 'parent', 'results')))

  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  g.listner[event.id] = async (serverEvent) => {
    event.results = serverEvent.results
    g.currentEvent = event

    if (wsLogs) {
      wsLogs[event.id].server = event
      console.log('ws', wsLogs[event.id])
      delete wsLogs[event.id]
    }

    if (serverEvent.e) {
      reject(serverEvent.e)
    } else {
      const result = await onSuccess()

      resolve(result)
    }
    delete g.listner[event.id]
  }

  return promise
}
