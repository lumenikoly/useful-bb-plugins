# Релизы плагинов

Каждый каталог `plugins/<id>` — отдельный пакет. Корневой `bb-plugins` приватный
и в npm не публикуется. Формат тега: `<id>-v<version>`, например
`project-themes-v0.1.0`. В bb ему соответствует `--tag-prefix project-themes-`.

## Перед первым публичным релизом

Репозиторий: https://github.com/lumenikoly/useful-bb-plugins.
Лицензия MIT и метаданные автора `lumenikoly` указаны в manifest;
текст лицензии находится в корне и в пакете Project Themes.
Git remote `origin` настроен на этот репозиторий.

Включите GitHub Actions; workflow релиза требует разрешения `contents: write`.

## Выпуск версии

Из корня репозитория:

```sh
npm ci
```

Первый выпуск уже имеет версию `0.1.0`. Для следующих выпусков поднимите
версию пакета, например:

```sh
npm version patch --workspace=bb-plugin-project-themes --no-git-tag-version
```

Обновите `plugins/project-themes/CHANGELOG.md`, описание и при необходимости
диапазоны совместимости `engines.bb` и `engines.bbPluginSdk`.

```sh
npm run typecheck --workspace=bb-plugin-project-themes
npm test --workspace=bb-plugin-project-themes
npm run build --workspace=bb-plugin-project-themes
npm pack --workspace=bb-plugin-project-themes --dry-run --ignore-scripts

git add .
git commit -m "Release project-themes 0.1.0"
git tag -a project-themes-v0.1.0 -m "Project Themes 0.1.0"
git push origin main
git push origin project-themes-v0.1.0
```

Workflow сверяет версию тега с manifest и каталогом, проверяет и собирает
только выбранный плагин, упаковывает его и создаёт черновик GitHub Release.
Просмотрите описание и архив, затем опубликуйте черновик в GitHub.
Опубликованные теги не перемещайте: исправления выпускаются следующей версией.

## Установка из Git

```sh
bb plugin install git:https://github.com/lumenikoly/useful-bb-plugins.git@main --plugin project-themes
bb plugin install git:https://github.com/lumenikoly/useful-bb-plugins.git@^0.1.0 --plugin project-themes --tag-prefix project-themes-
```

Первый вариант отслеживает ветку, второй — совместимые релизные теги.
Можно выбрать каталог напрямую: `--subdirectory plugins/project-themes`.
Обновления устанавливаются через `bb plugin update project-themes`.

## Необязательная публикация в npm

После входа в npm и проверки доступности имени пакета:

```sh
npm publish --workspace=bb-plugin-project-themes --access public
```

Скрипт `prepack` собирает пакет до упаковки. В npm-архив входят manifest,
`src`, `dist` с metadata, skills и документация. Тесты и локальные screenshots
не входят. Корневые файлы и другие плагины в архив не попадают.

Установка опубликованного пакета:

```sh
bb plugin install npm:bb-plugin-project-themes@^0.1.0
```

Публикация npm и добавление в Community marketplace — отдельные действия;
workflow создаёт только черновик GitHub Release.

## Новый плагин

Добавьте его в `.bb/plugins.json`, заведите собственный CHANGELOG и используйте
свой префикс тега. Например `project-icons-v0.1.0` и `--tag-prefix project-icons-`.
Укажите MIT и метаданные этого репозитория в manifest нового пакета,
скопируйте в него корневой LICENSE. Общий CI обрабатывает все workspace-пакеты;
release workflow выбирает пакет по тегу.
