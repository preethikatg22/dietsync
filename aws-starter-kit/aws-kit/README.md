# 🤖 AWS Kit — Let Kiro add S3 + AI to YOUR website

This is a **smart** starter kit. You drop the `aws-kit/` folder into your own project, open it
in **Kiro**, and Kiro walks you through adding **Amazon S3** (file storage) and **Amazon
Bedrock Nova Lite** (AI) — tailored to whatever you built.

Works for **plain HTML/CSS/JS, React, Vue**, and projects that **already have a Node backend**.

---

## 💰 First: will this cost money?

- Amazon Bedrock has **no permanent free tier**, BUT every new AWS account gets **$100–$200 in
  free credits**, and Bedrock/Nova usage counts against them.
- This kit defaults to **Nova Lite**, which costs about **$0.00006 per 1K input tokens**. A
  whole workshop of prompts costs **well under $1**. You'll barely dent your credits.
- Just remember to **clean up** afterward (see the end).

---

## 🚀 How to use it (with Kiro)

### 0. Put the kit in your project
Copy the `aws-kit/` folder into the root of your website project, so it sits next to your
`index.html` / `package.json`.

### 1. Open your project in Kiro and say:
> **"Analyze my project with the AWS kit and tell me where S3 and Bedrock fit."**

Kiro will run the analyzer, read your code, and explain — in plain English — what your project
does and give you a short menu of **specific** S3 and AI ideas for *your* site.

### 2. Pick what you want
Tell Kiro which ideas you like, e.g.:
> **"Let's add file upload to S3 and an AI summarize button."**

### 3. Let Kiro set it up
Kiro runs the generator, which **installs dependencies** and **creates the AWS files** for you
(it won't touch or overwrite your existing code). You'll get:
- `aws/s3.js`, `aws/bedrock.js` — reusable helpers
- `aws/awsRoutes.js` — API endpoints (`/api/aws/upload`, `/files`, `/ai`)
- `aws/frontend-snippet.html` — copy-paste `fetch` calls for your pages
- `.env` — your config
- `aws-server.js` — a tiny backend (only if your project didn't already have one)

### 4. Create your AWS resources
Kiro will guide you, but the three things you need:
```bash
# a) create your bucket (pick a unique name)
aws s3 mb s3://my-unique-student-bucket --region us-east-1

# b) enable the model: Bedrock console -> Model access -> enable "Nova Lite" (us-east-1)

# c) connect your credentials
aws configure
```
Then edit `.env` and set `S3_BUCKET_NAME` to your bucket.

> 🔐 Attach the policy in `aws-kit/iam-policy.json` to your IAM user (replace the bucket name).
> It grants **only** what this kit needs — S3 on your bucket + Nova Lite.

### 5. Ask Kiro to check your credentials
> **"Verify my AWS credentials."**

Kiro runs the verifier, which checks three things and tells you exactly how to fix anything:
- ✅ Credentials work (STS)
- ✅ S3 bucket reachable
- ✅ Bedrock Nova Lite responds

### 6. Launch 🎉
> **"Launch my site."**

Kiro starts your server. Open **http://localhost:3000** and test your new AWS features!

---

## 🔌 Using the API from your frontend

No AWS keys in the browser — ever. Your frontend just calls your backend:

```js
// Upload a file to S3
const fd = new FormData(); fd.append("file", fileInput.files[0]);
const { url } = await (await fetch("/api/aws/upload", { method: "POST", body: fd })).json();

// Ask the AI (Nova Lite)
const { text } = await (await fetch("/api/aws/ai", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Summarize: ..." }),
})).json();
```
(These are also saved in `aws/frontend-snippet.html`.)

---

## 🐍 Got a Python backend (Flask/Django)?

The kit adds a small **standalone Node AWS service** alongside your app (your frontend calls it
the same way). If you'd rather do it natively in Python, ask Kiro — it can give you the
`boto3` equivalent for S3 upload and `bedrock-runtime` Converse with Nova Lite.

---

## 🧰 Manual commands (if you're not using Kiro)

```bash
node aws-kit/analyze.mjs                                   # analyze your project
node aws-kit/setup.mjs --mode=add-node-backend --features=s3,bedrock   # generate + install
node aws-kit/verify.mjs                                    # check credentials & access
```
`--mode` is `add-node-backend` (frontend-only) or `existing-backend` (you already have Express).

---

## 🧹 Cleanup (after the event, to protect your credits)

```bash
aws s3 rm s3://my-unique-student-bucket --recursive
aws s3 rb s3://my-unique-student-bucket
```
Bedrock has no standing cost — you only pay per request.

---

## 🆘 Common issues

| Problem | Fix |
|---|---|
| AI call: `AccessDenied` / `ValidationException` | Enable **Nova Lite** in Bedrock console (us-east-1). Or set `BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0` in `.env`. |
| `bucket does not exist` | Create it (Step 4a) and match the name in `.env`. |
| `could not load credentials` | Run `aws configure`. |
| Region errors | Keep bucket, `aws configure`, and `AWS_REGION` the **same** region. |
| Port in use | Change `PORT` in `.env`. |

Happy building! 🚀
