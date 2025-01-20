import json
import numpy as np
import requests
from sklearn.metrics.pairwise import cosine_similarity
import os
import time
from questions import questions  # Import the questions list


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
        raise Exception(f"Error generating embeddings: {str(e)}")


# Function to save embeddings locally
def save_embeddings(embeddings, entries, filename):
    os.makedirs(os.path.dirname(filename), exist_ok=True)  # Ensure directory exists
    data_to_save = [
        {"entry": entry, "embedding": embedding}
        for entry, embedding in zip(entries, embeddings)
    ]
    with open(filename, "w") as f:
        json.dump(data_to_save, f)


# Function to load embeddings from a file
def load_embeddings(filename):
    try:
        with open(filename, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return []


# Function to query the stored embeddings
def query_embeddings(query_text, stored_data, model="nomic-embed-text", top_k=5):
    query_embedding = generate_embeddings([query_text], model)[0]
    stored_embeddings = np.array([entry["embedding"] for entry in stored_data])
    similarities = cosine_similarity([query_embedding], stored_embeddings)[0]
    top_indices = similarities.argsort()[-top_k:][::-1]
    return [(stored_data[i], similarities[i]) for i in top_indices]


# Function to generate an answer based on relevant texts
def answer_question(question, relevant_texts, model):
    if not relevant_texts:
        return "No relevant information found."

    context = "\n".join([json.dumps(text, indent=2) for text in relevant_texts])
    prompt = f"{question} Use only the information in the following text to answer the question: {context}"
    url = "http://localhost:11434/api/generate"
    payload = {"model": model, "prompt": prompt}
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(
            url, data=json.dumps(payload), headers=headers, stream=True
        )
        response.raise_for_status()

        # Combine the streaming response parts
        full_response = ""
        for line in response.iter_lines():
            if line:
                response_part = json.loads(line.decode("utf-8"))
                full_response += response_part.get("response", "")

        return full_response
    except requests.exceptions.RequestException as e:
        raise Exception(f"Error generating answer: {str(e)}")


def main(top_k):
    json_file_path = os.path.join(
        os.path.dirname(__file__), "data_compressed", "job-0.json"
    )
    json_filename = os.path.basename(json_file_path).replace(".json", "")

    # Ensure responses directory exists
    os.makedirs("responses", exist_ok=True)

    # Load JSON data
    try:
        with open(json_file_path, "r") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: JSON file not found at {json_file_path}")
        return

    texts = [" ".join([str(entry[key]) for key in entry]) for entry in data["results"]]

    # Generate and save embeddings if not already done
    embeddings_file = os.path.join("embeddings", f"{json_filename}_embeddings.json")
    if not os.path.exists(embeddings_file):
        embeddings = generate_embeddings(texts)
        save_embeddings(embeddings, data["results"], embeddings_file)

    # Load embeddings
    stored_data = load_embeddings(embeddings_file)
    if not stored_data:
        print("Error: No stored embeddings found.")
        return

    # List of models to test
    models = ["mistral-nemo"]

    # Process each question
    for question in questions:
        print(f"\nProcessing question: {question}")
        relevant_entries = query_embeddings(question, stored_data, top_k=top_k)
        relevant_texts = [entry["entry"] for entry, _ in relevant_entries]

        # Get answers from all models and append to the file
        for model in models:
            print(f"Generating response with model: {model}")
            start_time = time.time()
            answer = answer_question(question, relevant_texts, model)
            end_time = time.time()
            total_time = end_time - start_time
            print(f"Model {model} completed in {total_time:.2f} seconds")

            # Append the model name, question, response, and total time to the file
            response_file = os.path.join("results", f"{json_filename}_responses.txt")
            os.makedirs(os.path.dirname(response_file), exist_ok=True)  # Ensure dir
            with open(response_file, "a") as file:
                file.write(
                    f"Model: {model}\nQuestion: {question}\nResponse:\n{answer}\nTotal Time: {total_time:.2f} seconds\n\n---\n\n"
                )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("top_k", type=int, help="Number of top entries to consider")
    args = parser.parse_args()
    main(args.top_k)
