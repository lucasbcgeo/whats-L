import sys
import onnx_asr


def transcribe(audio_path, model_path):
    model = onnx_asr.load_model(
        "nemo-conformer-tdt",
        model_path,
    )
    print(model.recognize(audio_path, language="pt").strip())


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: transcribe.py <audio_file> <model_path>")
        sys.exit(1)

    transcribe(sys.argv[1], sys.argv[2])
