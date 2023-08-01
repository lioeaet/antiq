import g from '../g.js'
import { valToKey, set, isPromise } from '../utils.js'
import { get } from './get.js'
import { put } from './put.js'

// ивент и экшн

export function door(name, descFunc, getters = {}, setters = {}, opts) {
  const door = {
    name,
  }

  g.door[name] = door
  g.values[name] = {}
  g.events[name] = {}
  g.desc[name] = descFunc

  for (let k in getters) {
    door[k] = event(door, getters[k], k)
    g.events[name][k] = {}
  }

  for (let k in setters) {
    door[k] = event(door, setters[k], k, true)
  }

  return door
}

// очередь выполнения методов внутри ивентов и их количество
// на фронте и сервере одинаковы
// и мы можем использовать индекс массива
// напару с apiFnName он даёт полное представление о том, что за действие выполнено
// ведь все аргументы отправляются с первым запросом фронта

// в базу данных изменения коммитим

// door.event().method
// если ивент вызвался внутри не через event, то создастся новый ивент
// и руками отменять придётся два действия в случае ошибки одного из них

function event(door, apiFn, apiName, isSetter) {
  return async function event(...args) {
    const argsKey = valToKey(args)
    // 1. делаем массив операций ивента
    // 2. при первой нехватке данных или изменении бд отправляем запрос
    // 3. в ответе получаем либо ошибку, либо результат всех операций ивента
    // 4. продолжаем выполнять ивент, по очереди забирая из ответа данные
    // 5. массив экшнов удаляем в конце ивента, неважно делали запрос или нет

    // внутри экшнов смотрим, нужно ли отправлять запрос
    // самим экшнам не нужны id, они выполняются по порядку
    // нужен флаг, пришли ли

    const event = (g.currentEvent = {
      id: /* g.currentEvent?.id || */ Math.random(),
      doorName: door.name,
      method: apiName,
      results: [],
      count: -1,
      args,
    })

    g.methods[event.id] = [] // [{ type: 'get', args: [] }]
    g.loaders[event.id] = true

    if (!g.opened) await g.openingPromise

    if (!isSetter && g.events[door.name][apiName][argsKey])
      return g.events[door.name][apiName][argsKey]

    // get(id) === getOne
    // get({ ...equalityFilters }, { sort: ['name.asc'], pag: [from, to] }) === get[]
    // get(ast) -> get[]

    // весь случай, когда с сервера не отправляется ответ на метод
    // это если результат метода ивента можно записать
    // опираясь исключительно на фронтовый стор

    // door.api() useEvents(currentApi, door)
    // поскольку внутри ивентов асинхронность
    // нельзя гарантировать что после then эффекта
    // выполнится сразу тело ивента, а не then другого эффекта

    // back front get put rm sql

    // мы копим на фронте лоадинги и на сервере отвечаем пачкой
    // стимул ответа - востребованность информации на фронте
    // для продолжения выполнения ивента (задержка изменения интерфейса после действия пользователя)
    // точки отправки информации с сервера на фронт - не подключенный get и back
    // либо фронт внутри ивента доходит до точки неизвестности
    // и ожидает ответ сервера со всей информацией, необходимой для дальнейшего выполнения
    // ...либо ошибку

    // на фронте есть симулированный мир будущего
    // в этом мире есть симулированные id для put и результаты rm
    // он возвращается из хуков для показа пользователю
    // он используется внутри функций ивентов
    // реальный мир так же доступен
    // симулированный мир становится реальным после подтверждения сервера
    // в случае ошибки пользователь может попробовать повторить действие

    // put на свой success получает id
    // бэку нужно знать, о каком ивенте речь, он отправляется в каждом запросе
    // так же отправляется индекс метода, и если он в ивенте последний - везде фаза успеха и очистки
    // апи внутри ивента выполняется в строго определённом порядке
    // если не хочешь загружать фронт лишней работой, ты можешь перенести расчёты внутрь back
    // в зависимости от аргументов делать пересчёты

    // 2 варианта ликвидации эффектов для передачи eventId:
    // withEventId(event)
    // и await effect(oki)
    // effect позволяет не использовать door.api()
    // но можно ошибиться, забыв этот effect
    // точно так же можно ошибиться, не заюзав withEventId внутри door

    // зачем выполнять метод на фронте, если на сервере всё посчитано?
    // потому что его выполнение уже запущено до нехватки данных

    // ответ { methodResult, eventsResults }

    // на фронте асихнронность есть только один раз
    // и мы можем устанавливать g.currentEvent только один раз, в ws.js при приёме
    // но на сервере возможно несколько асихнронностей внутри экшна

    function setActionsWithEventToDoor() {
      door.get = withSettedEvent((id) => get(door.name, id))
      door.put = withSettedEvent((diff) => put(door.name, diff))
    }

    function withSettedEvent(action) {
      return async (...args) => {
        g.currentEvent = event
        const result = await action(...args)

        // по какой-то причине
        // синхронная установка переменных не даёт нужного результата
        // queueMicrotask делает её сразу после await при вызове
        queueMicrotask(setActionsWithEventToDoor)
        return result
      }
    }

    setActionsWithEventToDoor()

    let result
    try {
      result = await apiFn(...args)

      if (!isSetter) set(g.events, [door.name, apiName, argsKey], result)
    } catch (e) {
      console.log(e)
    }

    return result
  }
}
