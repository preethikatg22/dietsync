#!/usr/bin/env bash
# ============================================================
#  AWS Starter Kit — one-command setup helper (Mac/Linux)
#  Run with:  bash setup.sh
# ============================================================
set -e

echo ""
echo "🚀 AWS Starter Kit setup"
echo "------------------------"

# 1. Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js not found. Install Node 18+ then re-run."; exit 1; }
command -v aws  >/dev/null 2>&1 || { echo "⚠️  AWS CLI not found. Install it, or set keys manually in .env later."; }

echo "✅ Node.js: $(node -v)"

# 2. Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# 3. Create .env if missing
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "📝 Created .env — now open it and set your S3_BUCKET_NAME and AWS_REGION."
else
  echo ""
  echo "📝 .env already exists, leaving it as-is."
fi

echo ""
echo "✅ Done! Next steps:"
echo "   1. Create an S3 bucket:   aws s3 mb s3://YOUR-UNIQUE-BUCKET --region us-east-1"
echo "   2. Enable Nova Pro access in the Bedrock console (us-east-1)"
echo "   3. Run:                   aws configure"
echo "   4. Edit .env with your bucket name"
echo "   5. Start the app:         npm start"
echo ""
