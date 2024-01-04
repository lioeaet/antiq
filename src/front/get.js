import { sendEvent } from './ws.js'
import g from '../g.js'
import {
  getPath,
  set,
  iteratePrimitivesOrEmpty,
  isDoor,
  normId,
  getParentOrEvent,
} from '../utils.js'
import { addRelation } from './relations.js'

// i eventId
// d door
// e eventName
// a eventArgs
// err err
// c cookies...

// на одно свойство может потребоваться несколько сравнений (и/или)

export async function get(name, id, opts) {
  const { currentEvent: event } = g
  g.currentEvent = null
  const { count, results } = event

  // здесь если сущность уже есть на фронте со всеми полями
  // возвращаем её даже без промиса, синхронным кодом
  // изменённые поля определяем на сервере
  // при рассчётах внутри апи могут потребоваться поля, не возвращающиеся в компоненты
  // такие поля влияют на ререндер
  // поэтому для оптимизации рендера используем omit и select апи, а не хуки

  // вместо omit и select
  // сущности запрещённые для пользователей без прав
  // у них местоды в обёртках на доступы
  // а имеют доступ к ним только их создатели/изменители
  // а все put новых сущностей создают все поля дефолтные
  // а недоступные сущности не создают, они создаются отдельно теми кто имеет права

  const nId = normId(name, id)
  if (!g.val[nId]) g.val[nId] = {}
  if (!g.updated_at[nId]) g.updated_at[nId] = { val: new Date(0), value: {} }

  if (g.value[nId]) {
    if (!results[count]) results.push(g.value[nId])

    return g.value[nId]
  } else {
    g.value[nId] = {}
  }

  // results для автоматического сета на фронт
  // results посчитанное на фронте и не требующее отправки на сервер

  if (results[count]) {
    return getFromResults(event, count)
  }

  return sendEvent({
    event: getParentOrEvent(event),
    onSuccess: () => {
      return getFromResults(event, count)
    },
  })
}

function getFromResults(event, actionCount) {
  const { doorName, results } = event
  const desc = g.desc[doorName]
  const item = results[actionCount]
  const nId = normId(doorName, item.id)
  const updated_at = g.updated_at[nId] || 0
  const itemUpd = new Date(item.updated_at)

  if (itemUpd > updated_at.val) updated_at.val = itemUpd
  // иначе можем ничего не делать?
  delete item.updated_at

  iteratePrimitivesOrEmpty(item, (x, path) => {
    const upd_at = getPath(updated_at.value, path) || 0
    console.log(item, itemUpd, upd_at, path)
    if (itemUpd >= upd_at) {
      set(g.val[nId], path, x)
      set(g.value[nId], path, x)
      set(updated_at.value, path, itemUpd)

      const pathDesc = getPath(desc, path)
      if (isDoor(pathDesc)) addRelation(nId, path, normId(pathDesc.name, x))
    }

    set(updated_at.value, path, updated_at.val)
  })

  return g.value[nId]
}
