#!/usr/bin/env bash
# One-command install/update for an Ubuntu server (e.g. a DigitalOcean droplet).
# Run from inside the cloned repo:   sudo bash deploy/setup.sh
# Re-run it any time after `git pull` to deploy the latest code. Your data is kept.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  echo
  echo "First-time setup."
  read -rp "Domain for the site (leave blank to test on this server's IP address): " DOMAIN
  read -rp "Your email (admin login and support contact): " ADMIN

  if [ -n "$DOMAIN" ]; then
    APP_URL="https://$DOMAIN"
    SITE_ADDRESS="$DOMAIN"
  else
    IP=$(curl -fsS http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || curl -fsS https://ifconfig.me)
    APP_URL="http://$IP"
    SITE_ADDRESS=":80"
  fi

  cat > .env <<EOF
# Test mode: emails are printed to the logs instead of being sent (see "docker compose logs app").
# To go live: fill in RESEND_API_KEY and EMAIL_FROM, set NODE_ENV=production, then re-run deploy/setup.sh.
NODE_ENV=development
APP_URL=$APP_URL
SECRET_KEY=$(openssl rand -hex 32)
ADMIN_EMAIL=$ADMIN
SUPPORT_EMAIL=$ADMIN
COMPANY_NAME=
COMPANY_ADDRESS=
GOVERNING_LAW=
RESEND_API_KEY=
EMAIL_FROM=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_PRO_YEARLY=
PRO_TRIAL_DAYS=0
EOF
  chmod 600 .env
  echo "SITE_ADDRESS=$SITE_ADDRESS" > deploy/.env
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null
fi

docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

APP_URL=$(grep '^APP_URL=' .env | cut -d= -f2-)
echo
echo "Paysoon is starting at: $APP_URL"
echo "  Logs (and test-mode emails, incl. verification links):  docker compose -f deploy/docker-compose.yml logs -f app"
echo "  Edit settings:  nano .env   then re-run:  sudo bash deploy/setup.sh"
if [[ "$APP_URL" == http://* ]]; then
  echo "  NOTE: plain-HTTP IP mode is for testing only. Point a domain at this server and use it for real users."
fi
