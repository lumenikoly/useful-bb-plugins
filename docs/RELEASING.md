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

## Git Deck 0.1.0

Git Deck uses plugin ID `git-deck`, package `bb-plugin-git-deck` and directory
`plugins/git-deck`. Its tag prefix is `git-deck-`, independent of Project Themes.

Check the release package from the repository root:

```sh
npm run typecheck --workspace=bb-plugin-git-deck
npm test --workspace=bb-plugin-git-deck
npm run build --workspace=bb-plugin-git-deck
npm pack --workspace=bb-plugin-git-deck --dry-run --ignore-scripts
node scripts/release-info.mjs git-deck-v0.1.0
```

Commit the reviewed release files. After approval for the exact release commit,
push that commit to `main`, create the immutable `git-deck-v0.1.0` tag on it and push
the tag. The existing release workflow builds `bb-plugin-git-deck`, packages it and
creates a draft GitHub Release. Review the archive and publish the draft.

The Community marketplace payload is `marketplace/entries/git-deck.json`,
`marketplace/overview/git-deck.md` and `marketplace/screenshots/git-deck/`. Its source
tracks `^0.1.0` with `tagPrefix: git-deck-`. Copy these files into a current
`get-bb/marketplace` checkout, then run its build and check scripts. The proposed
PR body is `marketplace/git-deck-submission.md`. Show the complete entry, screenshots,
release source and PR text to the owner before creating the submission PR.

After the release tag is public:

```sh
bb plugin install git:https://github.com/lumenikoly/useful-bb-plugins.git@^0.1.0 --plugin git-deck --tag-prefix git-deck-
```
