import sys
import os
import whisper
import torch


def transcribe(audio_path, model_name="medium", device="cuda"):
    print(f"[Whisper] Device: {device}")
    print(f"[Whisper] Loading model: {model_name}")

    if device == "cuda" and torch.cuda.is_available():
        model = whisper.load_model(model_name, device="cuda")
        print(f"[Whisper] Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        model = whisper.load_model(model_name, device="cpu")
        print(f"[Whisper] Using CPU")

    result = model.transcribe(
        audio_path,
        language="pt",
        initial_prompt="Transcreva em portugues brasileiro. Comandos: cafe, almoco, janta, acordei, dormi, exercicio, games, procrastinacao, ansiedade, lazer, leitura, tarefa, encaminhhar.",
    )

    print(result["text"].strip())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: transcribe.py <audio_file> [model] [device]")
        print("device options: cpu, cuda")
        sys.exit(1)

    audio_file = sys.argv[1]
    model = sys.argv[2] if len(sys.argv) > 2 else "medium"
    device = sys.argv[3] if len(sys.argv) > 3 else "cuda"

    transcribe(audio_file, model, device)
