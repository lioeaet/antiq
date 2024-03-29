import { db } from './db.js'
import g from '../g.js'
import { delay, isDoor, isPlainObject } from '../utils.js'

// на get на сервере мы в тело апи ивента отправляем результат из бд
// кроме того, мы создаём подписку на все полученные поля сущности
// и пользуемся ими в оповещениях после put
// и также можем отправить по вебсокетам на фронт результат гета
// в случае если фронт уже подключен (sessionId, разделяется между фронтами)
// ничего на него не отправляем, а обходимся результатом в тело апи ивента

// мы сохраняем результат дб в кэш и возвращаем в тело
// если получили с фронта запрос с eventId-idx, то отвечаем на него и создаём подписку
// а если на фронте уже есть это всё, при оповещении фронта об окончании eventId, оно и уничтожается
// то есть, на сервере ивент может запуститься посередине выполнения ивента фронтом
// и заканчивается он всегда по оповещению фронта

// но мы можем и высчитать последнее нужное фронту от сервера действие внутри ивента
// и удалить весь кэш на этом
// мы выполняем тело ивента и на фронте и на сервере полностью
// уведомляем фронт об ошибке и отменяем результаты в случае ошибки сервера
// предлагаем повторить запрос
// в случае ошибки фронта ничего не отменяем
// но если сервер дошел до конца метода и без информации от него
// изменения сохраняются

// серверу фронт ждать никогда не надо
// вся инфа с фронта поступает в аргументы
// если нужно несколько действий на сервере
// фронт это всё ждёт пока сделает сервер

let count = 0

export async function get(name, id) {
  const result = await getItem(name, id)

  if (count < 2 && id == 1) {
    count = 0
    await delay(4000)
  } else {
    await delay(300)
    count++
  }
  // if (!id) throw 'no such item'

  return result
}

async function getItem(name, id, door, desc) {
  let pk = 'id'
  if (!door) door = name
  else pk = door
  const sql = await db()
  const instQ = await sql(`select * from "${name}" where "${pk}" = ${id};`)
  const inst = instQ.rows[0]
  if (!inst) return null

  if (!desc) desc = g.desc[name]

  for (let key in desc) {
    if (isDoor(desc[key])) {
      const childName = desc[key].name
      await getItem(childName, inst[key])
    } else if (isPlainObject(desc[key])) {
      inst[key] = await getItem(`${name}_${key}`, id, door, desc[key])
      if (pk === door) {
        delete inst[pk]
        delete inst.created_at
        delete inst.updated_at
      }
    }
  }
  return inst
}
