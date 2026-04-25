# El Mousafar

Transport app with:
- React frontend (`frontend`)
- Node/Express API + MySQL (`backend`)
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

This repo includes **Deploy El Mousafar to Azure** in `.github/workflows/azure-deploy.yml` (Container Apps + ACR).

### 1) Required GitHub Secrets

Set in **Repo -> Settings -> Secrets and variables -> Actions -> Secrets**:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `ADMIN_INVITE_SECRET` (optional but recommended)
- `MYSQL_PASSWORD`

### 2) Required GitHub Variables

Set in **Repo -> Settings -> Secrets and variables -> Actions -> Variables**:

- `AZURE_RESOURCE_GROUP`
- `AZURE_ACR_NAME`
- `CONTAINER_APP_API`
- `CONTAINER_APP_WEB`
- `VITE_API_BASE` (API URL, e.g. `https://<api>.azurecontainerapps.io`)
- `PUBLIC_APP_URL` (Web URL, e.g. `https://<web>.azurecontainerapps.io`)
- `MYSQL_HOST`
- `MYSQL_PORT` (usually `3306`)
- `MYSQL_USER`
- `MYSQL_DATABASE`
- `MYSQL_SSL` (`true` for Azure Database for MySQL)

### 3) Deploy

Push to `main` or run workflow **Deploy El Mousafar to Azure** manually.

The deploy workflow:
- Builds API + Web images in ACR
- Updates both Container Apps to the new image
- Sets runtime env vars for API

## Notes

- MySQL is now the persistent store for users, sessions, drivers, buses, lines, availability, and passenger alerts.
- On Azure Student, keep resources small (`0.25 CPU / 0.5Gi`) to reduce credits usage.
