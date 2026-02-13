-- PostgreSQL Database Setup SQL
-- Run this file to create the database and user

-- Create database (if you're logged in as postgres user)
CREATE DATABASE devices_db;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE devices_db TO postgres;

-- Verify
\l
