import psycopg2
import json
import requests


# Function to generate embeddings from text using Ollama API
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


# Connect to the PostgreSQL database
conn = psycopg2.connect("dbname=testdb user=myuser password=mypassword")
cur = conn.cursor()

# Read data from JSON file
with open("/home/ubuntu/ml-llm/embedding/data_compressed/job-1.json", "r") as f:
    data = json.load(f)

# Process each entry in the JSON data and insert into the database
for entry in data["results"]:
    cve_id = entry.get("cve", "CVE-ID-DEFAULT")[
        :12
    ]  # Use a default value or fetch appropriately
    keys_list = list(entry.keys())
    embedding = generate_embeddings([json.dumps(keys_list)])[
        0
    ]  # Generate embeddings and get the first result

    # Insert data
    cur.execute(
        """
        INSERT INTO cve_data (cve_id, data, embedding)
        VALUES (%s, %s, %s)
        """,
        (cve_id, embedding),
    )

conn.commit()

# Close the connection
cur.close()
conn.close()
