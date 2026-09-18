# Деплой на сервер по SSH

## 1. Ключ

Сгенерирован отдельный ключ только для CI-деплоя (не личный):
`deploy/robopodbor_deploy_key` (приватный, в git не попадёт — см. `.gitignore`)
`deploy/robopodbor_deploy_key.pub` (публичный, можно коммитить/показывать)

Публичный ключ:
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKkOW/qaVwzXqeW13bOB+S9SoReWClNVPW5CFyKAAHhB robopodbor-ci-deploy
```

## 2. Когда появится сервер (VPS)

На сервере, от пользователя, под которым будет катиться деплой (не root):

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKkOW/qaVwzXqeW13bOB+S9SoReWClNVPW5CFyKAAHhB robopodbor-ci-deploy" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Установить Docker + Docker Compose plugin, создать рабочую директорию и положить туда `docker-compose.yml` из корня репозитория:

```bash
sudo mkdir -p /opt/robopodbor
sudo chown $USER:$USER /opt/robopodbor
# скопировать docker-compose.yml на сервер (scp / git clone) в /opt/robopodbor
```

Проверить вручную, что ключ работает:

```bash
ssh -i deploy/robopodbor_deploy_key <user>@<host> 'echo ok'
```

## 3. Секреты в Sourcecraft

В настройках репозитория (Settings → Secrets) добавить:

| Секрет | Значение |
| --- | --- |
| `DEPLOY_HOST` | IP/домен сервера |
| `DEPLOY_USER` | пользователь на сервере (не root) |
| `DEPLOY_SSH_KEY` | содержимое `deploy/robopodbor_deploy_key` целиком |
| `REGISTRY_USERNAME` / `REGISTRY_PASSWORD` | доступ к Yandex Container Registry (после настройки service connection) |

После этого раскомментировать job `deploy` в `.sourcecraft/ci.yaml`.

## 4. Доступ по SSH к самому Sourcecraft (git push/pull по SSH)

Отдельно от деплоя — ключ для работы с git по SSH вместо HTTPS:

```bash
ssh-keygen -t ed25519 -C "<ваш email>" -f ~/.ssh/sourcecraft
```

Публичный ключ (`~/.ssh/sourcecraft.pub`) добавить в Sourcecraft → Settings → SSH keys.
Затем клонировать/добавить remote по SSH-адресу репозитория (вида
`git@sourcecraft.dev:<namespace>/robopodbor.git`), а не по HTTPS.
