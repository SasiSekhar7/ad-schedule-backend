#!/bin/bash

# -----------------------------
# PostgreSQL Setup Script
# -----------------------------

# CONFIGURATION - customize these
PG_USER="postgres"
PG_PASSWORD="Birla@1122"
PG_DB="testDB"

echo "🚀 Updating system packages..."
sudo apt update -y || sudo yum update -y

echo "📦 Installing PostgreSQL..."
# For Ubuntu
if command -v apt >/dev/null 2>&1; then
  sudo apt install -y postgresql postgresql-contrib
# For Amazon Linux / RHEL
elif command -v yum >/dev/null 2>&1; then
  sudo amazon-linux-extras enable postgresql14
  sudo yum clean metadata
  sudo yum install -y postgresql-server postgresql-devel
  sudo /usr/bin/postgresql-setup initdb
else
  echo "❌ Unsupported OS"
  exit 1
fi

echo "🔧 Starting PostgreSQL service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

echo "🔐 Setting up PostgreSQL user and database..."
# Run these commands as the postgres user
sudo -u postgres psql <<EOF
CREATE USER $PG_USER WITH PASSWORD '$PG_PASSWORD';
CREATE DATABASE $PG_DB;
GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;
EOF

echo "✅ PostgreSQL setup completed"
echo "📌 Connection info:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   User: $PG_USER"
echo "   DB:   $PG_DB"
