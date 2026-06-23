# Secure File Portal
[Live Website](https://secure-file-portal-eight.vercel.app/).

A browser-based end-to-end encrypted file sharing portal built for [Internee.pk](https://internee.pk). Files are encrypted in the browser using AES-256-GCM before they ever leave your device.

## Features

- **End-to-end encryption** — AES-256-GCM with PBKDF2 key derivation (100,000 iterations)
- **Zero-knowledge** — the server never sees your file contents or password
- **JWT authentication** — token-based access control
- **Drag & drop upload** — with real-time encryption progress
- **Secure download** — decrypt files directly in the browser
- **Upload history** — stored locally in the browser
- **Password strength meter** — with strong password generator
- **Rate limiting & security headers** — via Helmet.js

## Tech Stack

| Layer    | Technology |
|----------|-----------|
| Frontend | Vanilla HTML/CSS/JS, Web Crypto API |
| Backend  | Node.js, Express.js |
| Auth     | JSON Web Tokens (JWT) |
| Uploads  | Multer (disk storage) |
| Security | Helmet, CORS, express-rate-limit |
| Deploy   | Vercel (serverless) |

## Project Structure

```
secure-file-portal/
├── public/
│   └── index.html      # Frontend — all UI and crypto logic
├── server.js           # Express backend
├── package.json
├── vercel.json         # Vercel deployment config
├── .env.example        # Environment variable template
└── .gitignore
```

## Local Setup

**Prerequisites:** Node.js 18+, Git

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/secure-file-portal.git
cd secure-file-portal

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Open .env and set JWT_SECRET to a long random string:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Run locally
npm start
# Visit http://localhost:3000
```

## Environment Variables

| Variable     | Required | Description |
|-------------|----------|-------------|
| `JWT_SECRET` | ✅ Yes   | Long random string for signing JWTs |
| `PORT`       | No       | Server port (default: 3000) |

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## How It Works

### Upload Flow
1. User generates a JWT access token with their User ID
2. User selects a file and enters an encryption password
3. Browser generates a random salt (16 bytes) and IV (12 bytes)
4. PBKDF2 derives a 256-bit AES key from the password + salt
5. File is encrypted with AES-256-GCM entirely in the browser
6. Encrypted blob is uploaded to the server — password never leaves the device
7. Server returns a file key for later retrieval

### Download Flow
1. User enters the file key and the same encryption password
2. Server returns the encrypted file
3. Browser decrypts it locally using the password
4. Decrypted file is saved with its original filename and extension

### Encryption Format
```
[ 16 bytes salt ][ 12 bytes IV ][ encrypted ciphertext + 16 bytes GCM tag ]
```

## Deployment (Vercel)

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo
3. Add environment variable:
   - `JWT_SECRET` = your generated secret
4. Click **Deploy**

> **Note:** Vercel uses an ephemeral `/tmp` directory for file storage. Uploaded files may be lost between serverless function cold starts. For persistent storage, integrate an S3-compatible service.

## Security Notes

- Passwords are never sent to the server
- Each encryption uses a unique random salt and IV
- JWT tokens expire after 2 hours
- Rate limiting: 200 requests per 15 minutes per IP
- `/test-token` endpoint is for development only — remove or restrict it in production

## License

MIT
