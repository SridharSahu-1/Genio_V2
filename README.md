# Genio V2 - AI Video Platform

## Architecture
- **Frontend**: Next.js 14, Shadcn/UI, Tailwind (Port: 3000)
- **Backend**: Fastify, Mongoose, BullMQ (Port: 5000)
- **Worker**: Node.js + Python (WhisperX)
- **Infrastructure**: Docker (MongoDB, Redis, MinIO)

## Setup

1. **Start Infrastructure**:
   ```bash
   docker-compose up -d
   ```

2. **Backend**:
   ```bash
   cd server
   npm install
   # Create .env from example (or use defaults)
   npm run dev
   ```

3. **Worker**:
   ```bash
   cd worker
   npm install
   # Create .env from example (or use defaults)
   # Ensure python dependencies are installed:
   # pip install whisperx torch gc-python
   npm run dev
   ```

4. **Frontend**:
   ```bash
   cd client
   npm install
   npm run dev
   ```

## Python Requirements
The worker expects a python environment with `whisperx` installed.
```bash
pip install git+https://github.com/m-bain/whisperx.git
pip install torch torchvision torchaudio
```

## Features
- User Auth (JWT)
- Video Upload (Direct to MinIO S3)
- AI Subtitle Generation (WhisperX)
- Progress Tracking
- Dashboard



