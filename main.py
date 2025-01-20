import os
import requests
import time
import json
from collections import defaultdict

model_name = "gemma2:27b-instruct-q4_K_M"


def load_json(file_path):
    with open(file_path, "r") as json_file:
        return json.load(json_file)


def get_model_response(prompt):
    try:
        start_time = time.time()
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": model_name,
                "prompt": prompt,
                "options": {"num_ctx": 1192},
            },
            stream=True,
        )

        full_answer = []
        for line in response.iter_lines():
            if line:
                try:
                    json_response = line.decode("utf-8")
                    data = json.loads(json_response)
                    if data.get("done", False):
                        break
                    answer_part = data.get("response", "")
                    full_answer.append(answer_part)
                except json.JSONDecodeError as e:
                    print(f"Error decoding JSON: {str(e)}")
                    print("Raw line:", json_response)

        complete_answer = "".join(full_answer).strip()
        end_time = time.time()
        print(f"Time taken for model response: {end_time - start_time:.2f} seconds")
        return complete_answer

    except requests.exceptions.RequestException as e:
        print(f"Error while processing request: {str(e)}")
        return ""


def get_total_entries(data):
    return len(data["results"])


def group_by_product(results):
    grouped = defaultdict(list)
    for entry in results:
        product = entry.get("product", "Unknown")
        grouped[product].append(entry)
    return grouped


def process_batches(data, max_entries_per_batch=20):
    results = data["results"]
    affected_systems = data.get("affected", [])
    total_entries = get_total_entries(data)
    print(f"Total entries in results array: {total_entries}")

    grouped_results = group_by_product(results)
    responses = []

    for product, entries in grouped_results.items():
        if len(entries) <= 10:
            print(
                f"Skipping product {product} with {len(entries)} entries (less than or equal to 10 entries)"
            )
            continue

        batch_responses = []
        total_batches = len(list(create_batches(entries, max_entries_per_batch)))
        print(f"Product {product} has {total_batches} batch(es)")

        for batch_number, batch in enumerate(
            create_batches(entries, max_entries_per_batch), start=1
        ):
            batch_prompts = []
            for entry in batch:
                matching_systems = []
                for sys in affected_systems:
                    if sys.get("version") == entry.get("version"):
                        system_info = (
                            f"- Product: {sys.get('product', 'Unknown')}, "
                            f"Version: {sys.get('version', 'Unknown')}, "
                            f"Vendor: {sys.get('vendor', 'Unknown')}"
                        )
                        matching_systems.append(system_info)

                affected_systems_text = (
                    "\n".join(matching_systems)
                    if matching_systems
                    else "No matching affected systems found"
                )

                batch_prompts.append(
                    f"Name: {entry['name']}\n"
                    f"Severity: {entry['severity']}\n"
                    f"CVSS: {entry['cvss']}\n"
                    f"Threat Level: {entry['threat']}\n"
                    f"Mitigation: {entry.get('mitigation', 'No mitigation provided')}\n"
                    f"Affected Systems:\n{affected_systems_text}\n"
                    f"Description: {entry['description']}\n"
                    f"Meta: {json.dumps(entry.get('meta', {}))}\n"
                    f"CWE: {', '.join(entry.get('cwe', []))}\n"
                )

            combined_prompt = "\n".join(batch_prompts)
            prompt = (
                f"Summarize the key vulnerabilities for the product '{product}' from the provided JSON data. "
                "Provide a bullet-point list with the following information:\n\n"
                "- Vulnerability name\n"
                "- Severity level\n"
                "- Affected systems\n"
                "- Brief description\n\n"
                "Use keywords: CVE, exploit, patch. Merge similar descriptions into a comprehensive summary. "
                "Summarize results together instead of focusing on each CVE. "
                "Include actionable insights, focusing on what version the product should be updated to in order to fix the vulnerability.\n\n"
                f"Vulnerabilities:\n{combined_prompt}"
            )

            print(f"Processing batch {batch_number} for product {product}...")
            batch_response = get_model_response(prompt)
            responses.append(
                {
                    "batch_number": batch_number,
                    "product": product,
                    "batch": batch,
                    "prompt": prompt,
                    "response": batch_response,
                    "is_combined": False,
                    "total_batches": total_batches,
                }
            )

            if (
                total_batches > 1
            ):  # Only collect batch responses if we have multiple batches
                batch_responses.append(batch_response)

        # Only generate combined summary if we have multiple batches
        if total_batches > 1 and batch_responses:
            print(
                f"Generating combined summary for {product} as it has {total_batches} batches..."
            )
            combined_summaries_prompt = "\n".join(batch_responses)
            final_combined_prompt = (
                f"Combine the following summaries of vulnerabilities for the product '{product}' into a comprehensive summary. "
                "Ensure no redundancy and provide a clear overview of the key vulnerabilities. "
                "Merge similar descriptions and summarize results together. "
                "Include the top 10 most critical vulnerabilities, overall impact, potential exploitation scenarios, recommended actions, and update version. "
                "Also provide any actionable insights, emphasizing what version the product should be updated to in order to fix the vulnerability.\n\n"
                f"Summaries:\n{combined_summaries_prompt}"
            )

            print(f"Combining summaries for product {product}...")
            combined_summary = get_model_response(final_combined_prompt)
            responses.append(
                {
                    "batch_number": "combined",
                    "product": product,
                    "response": combined_summary,
                    "is_combined": True,
                    "total_batches": total_batches,
                }
            )

    return responses


def create_batches(entries, batch_size):
    return [entries[i : i + batch_size] for i in range(0, len(entries), batch_size)]


def save_batch_responses(responses, output_file):
    with open(output_file, "w") as f:
        current_product = None
        for response in responses:
            if current_product != response["product"]:
                current_product = response["product"]
                f.write(
                    f"\nProduct: {response['product']} (Total Batches: {response['total_batches']})\n"
                )
                f.write("=" * 80 + "\n\n")

            if response.get("is_combined", False):
                f.write("COMBINED SUMMARY:\n")
                f.write(f"{response['response']}\n")
            else:
                f.write(f"Batch Number: {response['batch_number']}\n")
                f.write(f"Complete Prompt:\n{response['prompt']}\n\n")
                f.write(f"Response:\n{response['response']}\n")
            f.write("-" * 80 + "\n\n")


def test_model():
    json_file_path = os.path.join(
        os.path.dirname(__file__), "data_compressed", "job-1.json"
    )
    json_file_name = os.path.basename(json_file_path).replace(".json", "")

    data = load_json(json_file_path)

    responses_folder = "summary"
    os.makedirs(responses_folder, exist_ok=True)

    filename = f"{responses_folder}/{model_name.replace(':', '_')}_{json_file_name}_combined_batches.txt"

    start_time = time.time()
    max_entries_per_batch = 20
    responses = process_batches(data, max_entries_per_batch=max_entries_per_batch)
    total_duration = time.time() - start_time

    print(f"Total time taken for processing: {total_duration:.2f} seconds")

    save_batch_responses(responses, filename)
    print(f"Batch responses saved to {filename}")


if __name__ == "__main__":
    test_model()
