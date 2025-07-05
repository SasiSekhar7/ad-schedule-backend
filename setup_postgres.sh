#!/bin/bash

# -----------------------------
# PostgreSQL Setup Script
# -----------------------------

# CONFIGURATION - customize these
PG_USER="adupuser"
PG_PASSWORD="Birla@1122"
PG_DB="testdb"

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
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$PG_USER') THEN
      CREATE USER $PG_USER WITH PASSWORD '$PG_PASSWORD';
   END IF;
END
\$\$;

CREATE DATABASE $PG_DB OWNER $PG_USER;

-- Grant full DB-level privileges
GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;

-- Connect to the DB and configure schema + object permissions
\c $PG_DB

-- Make adupuser the owner of public schema
ALTER SCHEMA public OWNER TO $PG_USER;

-- Grant full access to schema
GRANT USAGE, CREATE ON SCHEMA public TO $PG_USER;

-- Grant full access to existing tables and sequences
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $PG_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $PG_USER;

-- Set default privileges for future tables and sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON TABLES TO $PG_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT ALL ON SEQUENCES TO $PG_USER;
EOF

echo "✅ PostgreSQL setup completed"
echo "📌 Connection info:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   User: $PG_USER"
echo "   DB:   $PG_DB"
echo "   Password: $PG_PASSWORD"
