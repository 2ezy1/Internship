#!/bin/bash
# PostgreSQL Database Setup for Internship Project

echo "🔧 Setting up PostgreSQL database..."
echo ""

DB_NAME="devices_db"
DB_USER="postgres"
DB_PASSWORD="bisumain"

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo "❌ PostgreSQL is not running. Starting it..."
    sudo systemctl start postgresql
    sleep 2
fi

echo "✅ PostgreSQL is running"
echo ""

# Create database if it doesn't exist
echo "📦 Creating database '$DB_NAME'..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"

# Set password for postgres user
echo "🔑 Setting up database user..."
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

# Grant privileges
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Database details:"
echo "  Name: $DB_NAME"
echo "  User: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo "  Host: localhost"
echo "  Port: 5432"
echo ""
echo "Connection string: postgresql://postgres:bisumain@localhost:5432/devices_db"
echo ""
echo "Now restart your backend server:"
echo "  cd /home/mike/Documents/Internship/backend"
echo "  source venv/bin/activate"
echo "  python main.py"
