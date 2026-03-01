FROM nikolaik/python-nodejs:python3.10-nodejs20

WORKDIR /app

# Install system dependencies in one layer
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Upgrade pip and install Python dependencies (split layers for clearer errors and cache)
ENV PIP_DEFAULT_TIMEOUT=300
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install PyTorch CPU first (WhisperX 3.x requires torch~=2.8)
RUN pip install --no-cache-dir \
    torch==2.8.0 \
    torchaudio==2.8.0 \
    --index-url https://download.pytorch.org/whl/cpu

# Install WhisperX from PyPI (more reliable than git; matches torch 2.8)
RUN pip install --no-cache-dir whisperx

# Install Node dependencies first (better caching)
# Install ALL dependencies (including dev dependencies for building)
COPY package*.json ./
RUN npm install && npm cache clean --force

# Copy source code
COPY . .

# Build typescript
RUN npm run build

# Remove dev dependencies after build to reduce image size
RUN npm prune --production && npm cache clean --force

# Start worker
CMD ["node", "dist/index.js"]
