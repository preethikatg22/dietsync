# 🚀 AWS Starter Kit — Add S3 + Bedrock AI to Your Website

Welcome! By the end of this session you'll have **two real AWS features** working in a website:

1. 📦 **Amazon S3** — store & serve files (uploads, images, documents)
2. 🤖 **Amazon Bedrock (Nova Pro)** — add AI (chat, summarize, generate text)

The kit already contains all the code. You just need to plug in your AWS account. Follow the steps in order. 🙂

---

## ✅ Before you start (checklist)

- [ ] An **AWS account** (or the event sandbox account we gave you)
- [ ] **Node.js 18+** installed → check with `node -v`
- [ ] **AWS CLI** installed → check with `aws --version`
- [ ] A code editor (VS Code recommended)

> 💡 **Using Kiro IDE?** You can open this folder in Kiro and just ask it things like
> *"run the setup"* or *"why am I getting an access denied error?"* — it can read these files
> and help you live during the session.

---

## Step 1 — Install the project

Open a terminal **in this folder** and run:

```bash
npm install
```

This downloads the AWS SDK and the small web server. (One-time, ~30 seconds.)

---

## Step 2 — Create your S3 bucket

An S3 bucket is just a container for files. **Bucket names must be globally unique**, so add something random.

```bash
aws s3 mb s3://my-name-starter-kit-2026 --region us-east-1
```

✅ If it says `make_bucket: ...`, you're done. Remember this name!

---

## Step 3 — Turn on Bedrock Nova Pro access

Bedrock models are **off by default** — you have to request access once.

1. Go to the **Amazon Bedrock** console → pick region **US East (N. Virginia) `us-east-1`** (top right).
2. Left menu → **Model access** → **Modify model access / Enable specific models**.
3. Find **Amazon → Nova Pro** → check it → **Save / Submit**.
4. Wait until its status shows **Access granted** (usually instant for Amazon models).

> ⚠️ This is the #1 cause of errors. If AI calls fail later, come back here first.

---

## Step 4 — Set up your credentials

The server needs permission to talk to AWS. Easiest way:

```bash
aws configure
```

Enter your **Access Key ID**, **Secret Access Key**, region `us-east-1`, and output `json`.

> 🔐 Your organizer may give you an IAM user with the policy in `iam-policy.json` already
> attached. That policy only allows this kit's actions (S3 + Nova Pro) — nothing else.

---

## Step 5 — Configure the kit

Copy the example config and fill it in:

```bash
cp .env.example .env
```

Open `.env` and set:

```
AWS_REGION=us-east-1
S3_BUCKET_NAME=my-name-starter-kit-2026     # the bucket from Step 2
BEDROCK_MODEL_ID=amazon.nova-pro-v1:0
```

(You can leave the key fields blank if you ran `aws configure` in Step 4.)

---

## Step 6 — Run it! 🎉

```bash
npm start
```

Then open **http://localhost:3000** in your browser. You'll see two cards:

- **Upload a file** → stores it in your S3 bucket and gives you a secure link.
- **Ask Nova Pro** → type a prompt and get an AI answer.

If both work — **congratulations, you've integrated two AWS services!** 🥳

---

## 🧩 Now add it to YOUR website

The kit is deliberately tiny so you can copy the patterns. The two things you call from your
own site's frontend are just `fetch` requests:

**Upload a file to S3:**
```js
const formData = new FormData();
formData.append("file", myFileInput.files[0]);
const res = await fetch("http://localhost:3000/api/upload", { method: "POST", body: formData });
const { url } = await res.json();   // a link to your uploaded file
```

**Ask the AI:**
```js
const res = await fetch("http://localhost:3000/api/ai", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Summarize this: ..." }),
});
const { text } = await res.json();  // the AI's answer
```

The backend (`server.js`) is where the AWS magic happens. Keep your AWS keys **only** there.

### 💡 Ideas to build
- A "Summarize" button for a blog post
- An AI tagline / product-description generator
- A chatbot widget
- Profile-picture / image upload for user accounts
- A document/resume upload feature

---

## 🔐 The #1 Rule: Never put AWS keys in the browser

Notice the frontend has **zero** AWS credentials. All AWS calls go through the backend
(`server.js`). Anyone can view your website's JavaScript — if keys were there, they'd be stolen.
**Always proxy AWS calls through a backend.** (In production that backend would be AWS Lambda.)

---

## 🧹 Cleanup (do this after the event to avoid charges)

```bash
# Delete everything in the bucket, then the bucket itself
aws s3 rm s3://my-name-starter-kit-2026 --recursive
aws s3 rb s3://my-name-starter-kit-2026
```

Bedrock has **no standing cost** — you only pay per request, and the event usage is a few cents.

---

## 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| `AccessDeniedException` on AI call | Enable Nova Pro model access (Step 3). Try model ID `us.amazon.nova-pro-v1:0` in `.env`. |
| `The specified bucket does not exist` | Check `S3_BUCKET_NAME` in `.env` matches Step 2 exactly. |
| `credentials` / `could not load credentials` | Run `aws configure` (Step 4). |
| Model error about region | Make sure your bucket, `aws configure`, and `AWS_REGION` are all the **same** region. |
| Port 3000 already in use | Change `PORT` in `.env` to 3001. |

Check server status anytime: open **http://localhost:3000/api/health**

---

Happy building! 🚀
