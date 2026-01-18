import whisperx
from whisperx.diarize import DiarizationPipeline
import gc
import os
import torch
import warnings
from datetime import timedelta
import argparse
import sys
import requests
import tempfile

# Suppress annoying warnings
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)

# Fix for PyTorch 2.6+ 
# Not needed for Torch 2.1.2, but safe to keep wrapped if version checks were added.
# For now, removing the override to prevent issues with older torch versions if it fails.
if torch.__version__ >= "2.4":
    _orig_torch_load = torch.load
    def _new_torch_load(*args, **kwargs):
        kwargs['weights_only'] = False
        return _orig_torch_load(*args, **kwargs)
    torch.load = _new_torch_load

def format_ass_timestamp(seconds: float):
    td = timedelta(seconds=max(0, seconds))
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    centiseconds = int((seconds - total_seconds) * 100)
    return f"{hours:01d}:{minutes:02d}:{secs:02d}.{centiseconds:02d}"

def create_highlighting_subs(result, ass_path):
    """Creates an ASS file with international character support and word-level highlighting."""
    print(f"--- Creating Subtitle File: {ass_path} ---")
    
    header = [
        "[Script Info]",
        f"Title: {os.path.basename(ass_path)}",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "ScaledBorderAndShadow: yes",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial Unicode MS,36,&H00FFFFFF,&H0000FFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,2,0,2,10,10,60,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]

    with open(ass_path, "w", encoding="utf-8-sig") as f: 
        f.write("\n".join(header) + "\n")
        
        for segment in result["segments"]:
            start_str = format_ass_timestamp(segment['start'])
            end_str = format_ass_timestamp(segment['end'])
            speaker = segment.get('speaker', 'Unknown')
            
            line_text = f"[{speaker}]: "
            last_word_end = segment['start']
            
            words_to_process = segment.get('words', [])
            
            for word in words_to_process:
                if 'start' in word and 'end' in word:
                    gap = int((word['start'] - last_word_end) * 100)
                    if gap > 0:
                        line_text += f"{{\\k{gap}}}"
                    
                    duration = int((word['end'] - word['start']) * 100)
                    line_text += f"{{\\k{max(1, duration)}}}{word['word']} "
                    last_word_end = word['end']
            
            f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{line_text}\n")

def download_from_url(url: str, output_path: str):
    """Download video from presigned URL to local file."""
    print(f"📥 Downloading video from S3 presigned URL...")
    print(f"   URL (first 100 chars): {url[:100]}...")
    print(f"   Saving to: {output_path}")
    sys.stdout.flush()
    
    try:
        response = requests.get(url, stream=True, timeout=300)  # 5 minute timeout
        
        # Check status code before processing
        if response.status_code != 200:
            # Try to extract S3 error message from response body
            error_msg = f"HTTP {response.status_code}"
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(response.content)
                error_code = root.find('.//Code')
                error_message = root.find('.//Message')
                if error_code is not None:
                    error_msg = error_code.text or error_msg
                if error_message is not None:
                    error_msg = error_message.text or error_msg
            except:
                # If XML parsing fails, use response text
                if response.text:
                    error_msg = response.text[:200]
            
            print(f"❌ S3 error response: {error_msg}")
            sys.stdout.flush()
            response.raise_for_status()  # This will raise HTTPError with status code
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        if int(percent) % 10 == 0:  # Print every 10%
                            print(f"   Download progress: {percent:.1f}%")
                            sys.stdout.flush()
        
        print(f"✅ Successfully downloaded video ({downloaded} bytes)")
        sys.stdout.flush()
        return output_path
    except requests.exceptions.HTTPError as e:
        # Extract S3 error message if available
        error_msg = str(e)
        if hasattr(e.response, 'content'):
            try:
                import xml.etree.ElementTree as ET
                root = ET.fromstring(e.response.content)
                error_code = root.find('.//Code')
                error_message = root.find('.//Message')
                if error_code is not None and error_code.text:
                    error_msg = error_code.text
                if error_message is not None and error_message.text:
                    error_msg = error_message.text
            except:
                pass
        print(f"❌ Failed to download from URL: {error_msg}")
        print(f"   Status code: {e.response.status_code if hasattr(e, 'response') else 'N/A'}")
        sys.stdout.flush()
        raise Exception(error_msg)  # Raise with extracted error message
    except Exception as e:
        print(f"❌ Failed to download from URL: {e}")
        sys.stdout.flush()
        raise

def process_video_diarization(input_file_or_url, hf_token, output_dir, output_path=None):
    # Handle presigned URL - download if it's a URL
    input_file = input_file_or_url
    if input_file_or_url.startswith('http://') or input_file_or_url.startswith('https://'):
        if not output_path:
            # Generate temporary path for downloaded file
            output_path = os.path.join(output_dir, f"downloaded_{os.path.basename(input_file_or_url.split('?')[0])}")
        input_file = download_from_url(input_file_or_url, output_path)
    
    # Note: faster-whisper (used by whisperx.load_model) only supports CPU and CUDA, not MPS
    # So even if MPS is available, we need to use CPU for transcription
    if torch.cuda.is_available():
        device = "cuda"
        compute_type = "float16"
        print("✅ GPU Detected: Using CUDA with float16 precision.")
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        # MPS is available for PyTorch operations, but faster-whisper doesn't support it
        # Use CPU for whisperx.load_model, but can use MPS for other PyTorch operations
        device = "cpu"  # faster-whisper requires CPU or CUDA
        compute_type = "float32"  # Use float32 instead of int8 - int8 can cause SIGSEGV on macOS
        print("✅ Apple GPU Detected: MPS available for PyTorch, but using CPU for WhisperX (faster-whisper doesn't support MPS).")
    else:
        device = "cpu"
        compute_type = "float32"  # Use float32 for stability
        print("⚠️  GPU Not Detected: Using CPU with float32 precision.")

    if not os.path.exists(input_file):
        print(f"Error: File '{input_file}' not found.")
        return

    # 1. Transcribe
    print(f"--- Step 1: Transcribing {input_file} (Device: {device}) ---")
    sys.stdout.flush()
    # Drastically reduce batch size to 1 to prevent OOM
    # Also restrict threads if on CPU to prevent memory bloat
    if device == "cpu":
        # Use fewer threads to prevent memory issues - single thread is safest
        torch.set_num_threads(1)  # Single thread to minimize memory usage
        # Start with tiny model to avoid SIGSEGV crashes (can upgrade if successful)
        model_size = "tiny"  # tiny, base, small, medium, large
        print(f"Using model size: {model_size} (optimized for CPU stability)")
        print(f"Using single thread for CPU to minimize memory usage")
    else:
        model_size = "small"  # Use small for GPU
        
    print(f"Loading WhisperX model: {model_size} on {device} with {compute_type}...")
    sys.stdout.flush()
    
    # Try loading model with error handling
    try:
        print(f"Attempting to load {model_size} model...")
        sys.stdout.flush()
        model = whisperx.load_model(model_size, device, compute_type=compute_type)
        print(f"✅ Successfully loaded {model_size} model")
        sys.stdout.flush()
    except Exception as e:
        print(f"❌ Failed to load {model_size} model: {e}")
        sys.stdout.flush()
        if device == "cpu" and model_size != "tiny":
            print(f"⚠️  Falling back to 'tiny' model (lower quality but more memory-efficient)...")
            sys.stdout.flush()
            model_size = "tiny"
            try:
                model = whisperx.load_model(model_size, device, compute_type=compute_type)
                print(f"✅ Successfully loaded {model_size} model")
                sys.stdout.flush()
            except Exception as e2:
                print(f"❌ Failed to load tiny model as well: {e2}")
                raise
        else:
            raise
    
    # Explicit GC before transcription
    gc.collect()
    
    print(f"Loading audio from: {input_file}")
    sys.stdout.flush()
    try:
        audio = whisperx.load_audio(input_file)
        print(f"✅ Audio loaded successfully. Shape: {audio.shape if hasattr(audio, 'shape') else 'N/A'}")
        sys.stdout.flush()
    except Exception as e:
        print(f"❌ Failed to load audio: {e}")
        sys.stdout.flush()
        raise
    
    # Try transcription with minimal settings to avoid SIGSEGV
    print(f"Starting transcription with minimal settings...")
    sys.stdout.flush()
    try:
        # Use whisperx.transcribe which might handle errors better
        result = model.transcribe(audio, batch_size=1, language=None, task="transcribe")
        print(f"✅ Transcription completed")
        sys.stdout.flush()
    except Exception as e:
        print(f"❌ Transcription failed: {e}")
        print(f"   Error type: {type(e).__name__}")
        print(f"   This may be a compatibility issue with faster-whisper/ctranslate2 on macOS")
        print(f"   Consider using Docker for more stable transcription")
        sys.stdout.flush()
        raise
    except (SystemExit, KeyboardInterrupt):
        raise
    except BaseException as e:
        # Catch SIGSEGV and other crashes
        print(f"❌ Transcription crashed: {type(e).__name__}: {e}")
        print(f"   This is likely a ctranslate2/faster-whisper compatibility issue on macOS")
        print(f"   Try: docker-compose up worker (for stable transcription)")
        sys.stdout.flush()
        raise RuntimeError(f"Transcription crashed: {type(e).__name__}: {str(e)}. This may be a faster-whisper/ctranslate2 compatibility issue on macOS. Consider using Docker.")
    
    # Free memory immediately after transcription
    del model
    gc.collect()
    if device == "cuda":
        torch.cuda.empty_cache()
    
    detected_lang = result["language"]
    print(f"Detected Language: {detected_lang}")
    sys.stdout.flush()

    # 2. Align
    print(f"--- Step 2: Aligning {detected_lang} word timings ---")
    sys.stdout.flush()
    try:
        model_a, metadata = whisperx.load_align_model(language_code=detected_lang, device=device)
        result = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)
    except Exception as e:
        print(f"Alignment failed for {detected_lang}: {e}. Falling back to unaligned segments.")

    # 3. Diarize
    print("--- Step 3: Identifying Speakers ---")
    sys.stdout.flush()
    try:
        # Load model explicitly to catch auth/loading errors
        print(f"Loading diarization model: pyannote/speaker-diarization-3.1 (Device: {device})")
        diarize_model = DiarizationPipeline(use_auth_token=hf_token, device=device)
        print("Model loaded. Starting diarization...")
        sys.stdout.flush()
        
        diarize_segments = diarize_model(audio)
        result = whisperx.assign_word_speakers(diarize_segments, result)
    except Exception as e:
        print(f"Diarization Failed: {e}")
        print("Ensure you have accepted the user agreement for 'pyannote/speaker-diarization-3.1' and 'pyannote/segmentation-3.0' on Hugging Face.")
        # Fallback: Just save transcription without speaker labels if diarization fails
        print("Falling back to transcription only.")
        # We don't return here, we let it proceed to save the un-diarized result
        pass 

    # 4. Save
    base_name = os.path.splitext(os.path.basename(input_file))[0]
    output_ass = os.path.join(output_dir, f"{base_name}_{detected_lang}.ass")
    create_highlighting_subs(result, output_ass)

    print(f"\n✅ Success! [{detected_lang}] Subtitle file: {output_ass}")
    sys.stdout.flush()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    # Support both --input (local file) and --input_url (S3 presigned URL)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument("--input", help="Path to local video file")
    input_group.add_argument("--input_url", help="S3 presigned URL to download video from")
    parser.add_argument("--output_path", help="Path to save downloaded file (required if using --input_url)")
    parser.add_argument("--token", required=True)
    parser.add_argument("--output_dir", required=True)
    args = parser.parse_args()
    
    # Use URL if provided, otherwise use local input
    input_source = args.input_url if args.input_url else args.input
    process_video_diarization(input_source, args.token, args.output_dir, args.output_path)


