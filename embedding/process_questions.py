import json
import numpy as np
import requests
from sklearn.metrics.pairwise import cosine_similarity
import os
import re
import time
import subprocess  # Import subprocess to call the create_embeddings script
from questions import questions  # Import the questions list
from create_embeddings import (
    generate_embeddings,
)  # Import the generate_embeddings function


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
    prompt = "{} Use only the information in the following text to answer the question: {}".format(
        question, context
    )
    url = "http://localhost:11434/api/generate"
    payload = {"model": model, "prompt": prompt, "options": {"num_ctx": 8192}}
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

        return full_response, prompt
    except requests.exceptions.RequestException as e:
        raise Exception("Error generating answer: {}".format(str(e)))


def main(top_k):
    json_file_path = os.path.join(
        os.path.dirname(__file__), "data_compressed", "job-1.json"
    )
    json_filename = os.path.basename(json_file_path).replace(".json", "")

    # Path to the embeddings file
    embeddings_file = os.path.join(
        "embeddings", "{}_embeddings.json".format(json_filename)
    )

    # Check if the embeddings file exists
    if not os.path.exists(embeddings_file):
        print("Embeddings file not found. Generating embeddings...")
        subprocess.run(["python3", "create_embeddings.py"], check=True)
    else:
        print("Embeddings file found. Skipping embeddings generation.")

    # Load embeddings
    stored_data = load_embeddings(embeddings_file)
    if not stored_data:
        print("Error: No stored embeddings found.")
        return

    # List of models to test
    models = [
        "gemma2:27b",
        "deepseek-r1",
        "deepseek-r1:14b",
        "deepseek-r1:32b",
    ]

    # Process each question
    for question in questions:
        print("\nProcessing question: {}".format(question))
        relevant_entries = query_embeddings(question, stored_data, top_k=top_k)
        relevant_texts = [entry["entry"] for entry, _ in relevant_entries]

        # Get answers from all models and append to the file
        for model in models:
            print("Generating response with model: {}".format(model))
            start_time = time.time()
            answer, prompt = answer_question(question, relevant_texts, model)
            end_time = time.time()
            total_time = end_time - start_time
            print("Model {} completed in {:.2f} seconds".format(model, total_time))

            # Append the model name, question, response, prompt, and total time to the file
            response_file = os.path.join(
                "results", "{}_responses.txt".format(json_filename)
            )
            os.makedirs(os.path.dirname(response_file), exist_ok=True)  # Ensure dir
            # Check if the response contains the <think> tag
            if "<think>" in answer and "</think>" in answer:
                # Remove the <think>...</think> part from the response
                answer_without_think = re.sub(
                    r"<think>.*?</think>", "", answer, flags=re.DOTALL
                ).strip()
            else:
                # If no <think> tags are present, use the response as is
                answer_without_think = answer.strip()

            # Write the cleaned response to the file
            with open(response_file, "a") as file:
                file.write(
                    "Model: {}\nQuestion: {}\nPrompt:\n{}\nResponse:\n{}\nTotal Time: {:.2f} seconds\n\n---\n\n".format(
                        model, question, prompt, answer_without_think, total_time
                    )
                )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("top_k", type=int, help="Number of top entries to consider")
    args = parser.parse_args()
    main(args.top_k)
