#!/bin/bash

# Setup New Customer Instance Script
# This script helps automate Supabase and Vercel setup for a new customer.

set -e

echo "==========================================="
echo "   New Customer Setup Automation"
echo "==========================================="

# Check prerequisites
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is not installed."
    exit 1
fi

if ! command -v vercel &> /dev/null; then
    echo "Error: Vercel CLI is not installed."
    exit 1
fi

echo ">> Step 1: Data Collection"
read -p "Enter Customer/Project Name (e.g., customer-x): " PROJECT_NAME
read -p "Enter Supabase Project Reference ID (create this in Supabase Dashboard first): " SUPABASE_REF
read -p "Enter Supabase DB Password (to push migrations): " -s DB_PASSWORD
echo ""

echo "-------------------------------------------"
echo ">> Step 2: Supabase Setup"
echo "Linking to Supabase Project: $SUPABASE_REF"

# Unlink any existing (local dev) to be safe, or just force link
supabase link --project-ref "$SUPABASE_REF" --password "$DB_PASSWORD"

echo "Pushing Database Schema..."
supabase db push --password "$DB_PASSWORD"

echo "✅ Supabase Setup Complete!"

echo "-------------------------------------------"
echo ">> Step 3: Vercel Setup"
echo "Creating Vercel Project..."

vercel link --yes --project "$PROJECT_NAME"

echo "Configure Environment Variables?"
read -p "Do you want to interactively set env vars now? (y/n) " SET_ENVS

if [ "$SET_ENVS" = "y" ]; then
    echo "Enter values for Production environment:"
    
    # Helper function to add env var
    add_env() {
        KEY=$1
        read -p "$KEY: " VAL
        echo "$VAL" | vercel env add "$KEY" production
    }

    add_env "NEXT_PUBLIC_SUPABASE_URL"
    add_env "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    add_env "FACEBOOK_APP_ID"
    read -p "FACEBOOK_APP_SECRET (Input Hidden): " -s FB_SECRET
    echo ""
    echo "$FB_SECRET" | vercel env add "FACEBOOK_APP_SECRET" production
    
    add_env "FACEBOOK_VERIFY_TOKEN"
    add_env "NVIDIA_API_KEY"
    add_env "CLOUDINARY_CLOUD_NAME"
    add_env "CLOUDINARY_API_KEY"
    read -p "CLOUDINARY_API_SECRET (Input Hidden): " -s CL_SECRET
    echo ""
    echo "$CL_SECRET" | vercel env add "CLOUDINARY_API_SECRET" production
    
    echo "✅ Env Vars Added!"
fi

echo "-------------------------------------------"
echo ">> Step 4: Deploying"
vercel deploy --prod

echo "==========================================="
echo "   Setup Complete for $PROJECT_NAME"
echo "==========================================="
echo "Don't forget to configure the Facebook App Webhook with the new URL!"
