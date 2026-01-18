FROM nikolaik/python-nodejs:python3.10-nodejs20

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --upgrade pip

# Install PyTorch 2.1.2 CPU-only (Stable, compatible with WhisperX and newer Pyannote)
# Use CPU-only version to avoid CUDA issues in Docker
RUN pip install torch==2.1.2 torchvision==0.16.2 torchaudio==2.1.2 --index-url https://download.pytorch.org/whl/cpu --no-cache-dir

# Install WhisperX
# This will pull compatible dependencies on top of the existing torch installation
RUN pip install git+https://github.com/m-bain/whisperx.git

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build typescript
RUN npm run build

# Start worker
CMD ["node", "dist/index.js"]
