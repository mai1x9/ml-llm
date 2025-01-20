import json
import os

# Define the paths for the data folders
input_folder = "/home/ubuntu/ml-llm/data"
output_folder = "/home/ubuntu/ml-llm/data_compressed"

# Define the keys you want to extract
keys_to_extract = [
    "name",
    "description",
    "severity",
    "cvss",
    "threat",
    "mitigation",
    "product",
    "version",
    "cwe",
]  # Removed "meta" and "affected" for simplicity


def extract_and_flatten(json_data, keys):
    # Extract the relevant fields from the JSON data and flatten it
    flattened_results = []
    for item in json_data.get("results", []):
        extracted_item = {key: item.get(key, None) for key in keys}
        flattened_results.append(extracted_item)

    return {"results": flattened_results}


def process_file(input_file, output_file):
    # Read the JSON file
    with open(input_file, "r") as infile:
        data = json.load(infile)
        flattened_data = extract_and_flatten(data, keys_to_extract)

    # Write the flattened data to a new JSON file
    with open(output_file, "w") as outfile:
        json.dump(flattened_data, outfile, indent=4)


def process_all_files(input_folder, output_folder):
    # Create the output folder if it doesn't exist
    os.makedirs(output_folder, exist_ok=True)

    # Process each file in the input folder
    for filename in os.listdir(input_folder):
        if filename.endswith(".json"):
            input_file = os.path.join(input_folder, filename)
            output_file = os.path.join(output_folder, filename)
            process_file(input_file, output_file)
            print(f"Processed and saved {filename} to {output_file}")


if __name__ == "__main__":
    process_all_files(input_folder, output_folder)
