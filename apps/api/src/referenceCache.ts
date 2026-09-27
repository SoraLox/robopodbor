/*
  Кеш справочников в памяти процесса: каталог, таксономия, типы объектов и состав
  полей меняются только через админку, а читаются на каждой странице мастера.

  Запись через API текущего процесса сбрасывает кеш сразу. TTL нужен на случай
  нескольких инстансов API: чужой инстанс увидит правку не позже чем через TTL.
*/
const TTL_MS = 60_000;

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();
// Загрузка, начатая до сброса, не должна положить в кеш данные, прочитанные до правки.
let generation = 0;

export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  // Одновременные промахи по одному ключу ждут один запрос к БД, а не делают по своему.
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const startedAt = generation;
  const promise = load()
    .then((value) => {
      if (startedAt === generation) store.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
  pending.set(key, promise);
  return promise;
}

export function invalidateReference() {
  generation++;
  store.clear();
  pending.clear();
}
