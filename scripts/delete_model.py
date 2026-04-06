from huggingface_hub import HfApi

api = HfApi()
models_to_delete = ["Systran/faster-whisper-large-v3"]

for m in models_to_delete:
    try:
        api.delete_repo_cache(repo_id=m, repo_type="model")
        print(f"Deleted: {m}")
    except Exception as e:
        print(f"Error deleting {m}: {e}")
