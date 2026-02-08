FROM nikolaik/python-nodejs:python3.10-nodejs20

WORKDIR /app

# Install system dependencies in one layer
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Upgrade pip and install Python dependencies in one layer for better caching
RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir \
    torch==2.1.2 \
    torchvision==0.16.2 \
    torchaudio==2.1.2 \
    --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir git+https://github.com/m-bain/whisperx.git

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
