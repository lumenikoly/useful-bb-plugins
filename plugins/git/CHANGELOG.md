# Changelog

## 0.1.0

- GitHub Actions Checks via gh: branch workflow runs, jobs, failed-step logs and editable Fix it requests in BB's native composer.
- Repository-specific GitHub account selection, system SSH alias resolution, revision/attempt guards and bounded diagnostic output.

- Сохранена совместимость snapshot с уже открытым интерфейсом при перезагрузке плагина: поля `branches` и `history` остаются доступны.

- Переработан интерфейс по Git Log IntelliJ IDEA: ветки / граф / детали коммита.
- Локальные и remote-ветки, поиск, избранное и фильтрация журнала.
- Tracking checkout, создание от ветки/коммита, rename, безопасный delete, merge.
- Восстановление после merge-конфликта и сравнение веток с HEAD.
- Diff файлов выбранного коммита, загрузка истории порциями.
- Подсказка о HTTPS remote и неприменимости SSH-команды к HTTPS.

- Git-панель: изменения, stage, diff, коммиты, история и локальные ветки.
- Fetch / Pull / Push стандартными командами Git на машине checkout.
- Локальные настройки автора, SSH-команды и remote URL каждого проекта.
- Askpass-диалог для паролей, passphrase и нового SSH host key.
