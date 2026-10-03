# bb-plugins

Коллекция небольших самостоятельных плагинов для bb. Каждый пакет имеет свою
версию, описание, исходники, тесты и теги релизов.

| Плагин | Пакет | Описание |
| --- | --- | --- |
| [Project Themes](plugins/project-themes/README.md) | `bb-plugin-project-themes` | Один мягкий цвет на проект: треды, вкладка браузера и общий фон. |
| [Git](plugins/git/README.md) | `bb-plugin-git` | Изменения, diff, staging, коммиты, ветки и push/pull с отдельным аккаунтом проекта. |

## Структура

```text
.bb/plugins.json             Каталог для установки конкретного плагина
.github/workflows/           Общий CI и создание черновиков релизов
plugins/
  project-themes/
    package.json             Самостоятельный manifest bb/npm
    src/                     Frontend и backend
    tests/
    skills/
    README.md
    PLUGIN_OVERVIEW.md
    CHANGELOG.md
docs/RELEASING.md             Порядок выпуска независимых версий
scripts/release-info.mjs      Сопоставление тега, каталога и версии пакета
package.json                 Приватный npm workspace
package-lock.json            Один lockfile для всей коллекции
```

`packages/` добавляется только при появлении настоящего общего кода.
Зависимости объявляются в пакетах плагинов, npm hoist устанавливает общие версии
один раз. SDK остаётся закреплён в каждом пакете; сборочная версия `bb-app`
закреплена в корне. tsconfig плагина самодостаточен для установки из поддиректории Git.

## Разработка

Используйте Node.js 24 (`nvm use`), затем из корня:

```sh
npm install
npm run typecheck
npm test
npm run build
```

Работа с одним плагином:

```sh
npm run build --workspace=bb-plugin-project-themes
npm run dev:project-themes
bb plugin install path:. --plugin project-themes
```

## Добавление плагина

1. Создайте `plugins/<id>/` с собственным `package.json`, исходниками и README.
2. Объявите `bb.server`, при необходимости `bb.app`, branding и совместимость.
3. Добавьте `{ "name": "<id>", "source": "./plugins/<id>" }` в `.bb/plugins.json`.
4. Добавьте скрипты `build`, `typecheck` и `test` в пакет; общие команды и CI подхватят их.
5. Выполните `npm install` в корне и добавьте описание в эту таблицу.

## Релизы

Теги имеют вид `project-themes-v0.1.0`. Версии плагинов независимы;
корневой workspace не публикуется. Push тега запускает сборку выбранного пакета
и создаёт **черновик** GitHub Release с npm-архивом. Публикация черновика выполняется вручную.

Подробные команды установки из Git, выпуска и необязательной публикации npm:
[docs/RELEASING.md](docs/RELEASING.md).

## Лицензия

[MIT](LICENSE), copyright © 2026 lumenikoly.
