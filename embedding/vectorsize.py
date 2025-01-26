import requests
import json

# Embedding models you want to test
embedding_models = [
    "nomic-embed-text",
    "all-minilm",
    "bge-m3",
    "mxbai-embed-large",
    "snowflake-arctic-embed",
    "bge-large",
    "snowflake-arctic-embed2",
    "granite-embedding",
    # Add more models as needed
]

# Sample text to generate embeddings
sample_text = "Sample text to find out the embedding vector length."

# Ollama API endpoint
EMBEDDING_API_URL = "http://localhost:11434/api/embed"


# Function to generate embeddings and return the vector length
def get_embedding_vector_length(model, text):
    payload = {"model": model, "input": [text]}
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(
            EMBEDDING_API_URL, data=json.dumps(payload), headers=headers
        )
        response.raise_for_status()
        embeddings = response.json()["embeddings"]
        vector_length = len(embeddings[0]) if embeddings else 0
        return vector_length
    except requests.exceptions.RequestException as e:
        print(f"Error generating embeddings for model {model}: {str(e)}")
        return None


# Main function to test embedding models
def main():
    for model in embedding_models:
        vector_length = get_embedding_vector_length(model, sample_text)
        if vector_length:
            print(f"Model: {model}, Embedding Vector Length: {vector_length}")
        else:
            print(f"Failed to get embedding vector length for model {model}")


if __name__ == "__main__":
    main()
