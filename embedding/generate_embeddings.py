import json
import requests

EMBEDDING_API_URL = "http://localhost:11434/api/embed"


def generate_embeddings_for_input(input_data, model="bge-m3"):
    """Generate embeddings for a list of inputs"""
    payload = {"model": model, "input": input_data}
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(
            EMBEDDING_API_URL, data=json.dumps(payload), headers=headers
        )
        response.raise_for_status()
        return response.json()["embeddings"]
    except requests.exceptions.RequestException as e:
        raise Exception(f"Error generating embeddings: {str(e)}")
