# El Mousafar

Transport app with:
- React frontend (`frontend`)
- Node/Express API + SQLite (`backend`)
- Driver/admin account management in `Mon compte`

## Local start

```bash
# terminal 1
cd backend && npm start

# terminal 2
cd frontend && npm run dev
```

Open `http://127.0.0.1:5173`.

## Docker Compose

```bash
docker compose up --build
```

- Web: `http://localhost:8080`
- API: `http://localhost:4000`

## Deploy to Azure Student with GitHub Actions

This repo includes two workflows:

1. **Bootstrap infra**: `.github/workflows/azure-bootstrap.yml`
2. **Build + Deploy app**: `.github/workflows/azure-deploy.yml`

### 1) Required GitHub Secrets

Set in **Repo -> Settings -> Secrets and variables -> Actions -> Secrets**:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `ADMIN_INVITE_SECRET` (optional but recommended)
- `SMTP_HOST` (optional)
- `SMTP_PORT` (optional)
- `SMTP_USER` (optional)
- `SMTP_PASS` (optional)
- `SMTP_FROM` (optional)

### 2) Bootstrap resources

Run workflow **Bootstrap Azure Student Infra** manually from Actions.

It creates:
- Resource group
- ACR (Basic)
- Container Apps environment
- API + Web Container Apps
- Managed identities + `AcrPull` role assignment

At the end it prints values for GitHub Variables.

### 3) Required GitHub Variables

Set in **Repo -> Settings -> Secrets and variables -> Actions -> Variables**:

- `AZURE_RESOURCE_GROUP`
- `AZURE_ACR_NAME`
- `CONTAINER_APP_API`
- `CONTAINER_APP_WEB`
- `VITE_API_BASE` (API URL, e.g. `https://<api>.azurecontainerapps.io`)
- `PUBLIC_APP_URL` (Web URL, e.g. `https://<web>.azurecontainerapps.io`)

### 4) Deploy

Push to `main` or run workflow **Deploy El Mousafar to Azure** manually.

The deploy workflow:
- Builds API + Web images in ACR
- Updates both Container Apps to the new image
- Sets runtime env vars for API

## Notes

- SQLite in Container Apps is ephemeral when set to `/tmp/mousafar.sqlite`.
  For production persistence, mount Azure Files and point `SQLITE_PATH` there.
- On Azure Student, keep resources small (`0.25 CPU / 0.5Gi`) to reduce credits usage.
