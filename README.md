# CRM System

This is a CRM system built with React, Vite, Express, and PostgreSQL (with pgvector).

## Local Development

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

## Production Deployment to VPS via GitHub Actions

This project includes a fully automated deployment pipeline using GitHub Actions (`.github/workflows/deploy.yml`). It automatically builds and deplons the application to your own VPS whenever you push changes to the `main` branch.

### Prerequisites

You need a VPS with the following installed and configured:
1. Node.js (v18+)
2. npm
3. PM2 (`npm install -g pm2`) for process management
4. Git
5. The project repository already cloned at your designated `PROJECT_PATH`

### Setup Instructions

1. Go to your GitHub repository: **Settings > Secrets and variables > Actions > New repository secret**.
2. Add the following Secrets:

* `VPS_HOST`: Your VPS IP address or domain name (e.g., `123.45.67.89`)
* `VPS_USERNAME`: Your VPS SSH login username (e.g., `root`, `ubuntu`)
* `VPS_PRIVATE_KEY`: Your SSH private key (starts with `-----BEGIN...`)
* `VPS_PORT`: Your SSH port (usually `22`)
* `PROJECT_PATH`: The absolute path to your cloned repository on the VPS (e.g., `/var/www/my-crm`)
* `APP_NAME`: The name you want to use for the PM2 process (e.g., `crm-app`)
* `APP_PORT`: The port your app should run on under the VPS (e.g., `3005`)

### How it Works

Once the secrets are configured, any code push to the `main` branch will trigger the workflow. The Action will:
1. SSH into your VPS.
2. Navigate to your `PROJECT_PATH`.
3. Pull the latest code from `main`.
4. Update the `.env` file with the `APP_PORT`.
5. Install npm dependencies (`npm install`).
6. Build the full-stack project (`npm run build`).
7. Reload or start the PM2 process for your application.

### Important Note about Database
Make sure you have your database environment variables (`DATABASE_URL` or `PG_VECTOR_URL`) configured in your VPS environment or within the `.env` file at the deployment location.
