import json
import requests
import os


# Function to generate embeddings from text
def generate_embeddings(text_list, model="nomic-embed-text"):
    url = "http://localhost:11434/api/embed"
    payload = {"model": model, "input": text_list}
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(url, data=json.dumps(payload), headers=headers)
        response.raise_for_status()
        return response.json()["embeddings"]
    except requests.exceptions.RequestException as e:
        raise Exception("Error generating embeddings: {}".format(str(e)))


# Function to save embeddings locally
def save_embeddings(embeddings, entries, filename):
    os.makedirs(os.path.dirname(filename), exist_ok=True)  # Ensure directory exists
    data_to_save = [
        {"entry": entry, "embedding": embedding}
        for entry, embedding in zip(entries, embeddings)
    ]
    with open(filename, "w") as f:
        json.dump(data_to_save, f)


def main():
    json_file_path = os.path.join(
        os.path.dirname(__file__), "data_compressed", "job-1.json"
    )
    json_filename = os.path.basename(json_file_path).replace(".json", "")

    # Load JSON data
    try:
        with open(json_file_path, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: JSON file not found at {}".format(json_file_path))
        return

    texts = [" ".join([str(entry[key]) for key in entry]) for entry in data["results"]]

    # Generate and save embeddings
    embeddings_file = os.path.join(
        "embeddings", "{}_embeddings.json".format(json_filename)
    )
    embeddings = generate_embeddings(texts)
    save_embeddings(embeddings, data["results"], embeddings_file)
    print("Embeddings saved to {}".format(embeddings_file))


if __name__ == "__main__":
    main()
