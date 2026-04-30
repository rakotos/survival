# Survival Mode / Выживальщик

PWA-прототип офлайн-приложения для критических ситуаций. Главная идея: дать первое полезное действие за 3-5 секунд, без длинных инструкций и без backend.

## Что в проекте оставить
- [content](C:/Users/rakot/Documents/New%20project/survival-app/content) как контентную и продуктовую базу.
- [design](C:/Users/rakot/Documents/New%20project/survival-app/design) как UX-спецификацию.
- Новый web-слой в корне проекта:
  - [index.html](C:/Users/rakot/Documents/New%20project/survival-app/index.html)
  - [style.css](C:/Users/rakot/Documents/New%20project/survival-app/style.css)
  - [app.js](C:/Users/rakot/Documents/New%20project/survival-app/app.js)
  - [scenarios.json](C:/Users/rakot/Documents/New%20project/survival-app/scenarios.json)
  - [manifest.json](C:/Users/rakot/Documents/New%20project/survival-app/manifest.json)
  - [service-worker.js](C:/Users/rakot/Documents/New%20project/survival-app/service-worker.js)

## Что теперь лишнее
- [lib](C:/Users/rakot/Documents/New%20project/survival-app/lib), [pubspec.yaml](C:/Users/rakot/Documents/New%20project/survival-app/pubspec.yaml), [analysis_options.yaml](C:/Users/rakot/Documents/New%20project/survival-app/analysis_options.yaml) и весь Flutter-проект в [app](C:/Users/rakot/Documents/New%20project/survival-app/app) теперь legacy-слой. Я его не удалял, но для PWA MVP он не нужен.

## Как запустить локально
Нужен простой локальный сервер. Из корня проекта:

```powershell
cd "C:\Users\rakot\Documents\New project\survival-app"
python -m http.server 8080
```

Если `python` недоступен:

```powershell
npx serve .
```

После этого открыть:

`http://localhost:8080`

Важно: через `file://` service worker и PWA-установка работать не будут.

## Как установить как PWA
1. Открыть приложение в Chrome, Edge или Android Browser на базе Chromium.
2. Дождаться полной загрузки.
3. Нажать кнопку установки в браузере или кнопку `＋` в приложении, если браузер отдаст install prompt.
4. После установки приложение будет открываться как отдельное офлайн-окно.

## Как добавить новый язык
Все данные лежат в [scenarios.json](C:/Users/rakot/Documents/New%20project/survival-app/scenarios.json).

1. Добавить язык в `languages`.
2. Добавить переводы в `ui`.
3. Добавить переводы `title` и `hint` в `places` и `problems`.
4. Добавить переводы `text` и при необходимости `voice` в `actions`.

Логика приложения не меняется, если структура JSON сохранена.

## Как добавить новый сценарий
1. Добавить новую проблему в `problems`.
2. Добавить `problemId` в нужное место в `places`.
3. Создать новый ключ в `scenarios`, например:

```json
"forest.new_problem": {
  "steps": ["stop", "find_shelter", "call_help"]
}
```

4. Если не хватает шагов, сначала создать новый action в `actions`.

## Что уже есть в MVP
- PWA с `manifest.json`
- офлайн-работа через `service-worker.js`
- 6 языков интерфейса: `ru`, `en`, `et`, `fi`, `lv`, `lt`
- выбор места и проблемы
- пошаговый экран: один шаг на экран
- озвучивание через Web Speech API
- SOS-экран
- GPS-координаты через Geolocation API
- копирование SOS-сообщения
- Web Share API, если поддерживается браузером
- режим низкого заряда
