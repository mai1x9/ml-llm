import psycopg2
import json
import requests
import re
import time
from generate_embeddings import generate_embeddings_for_input
from questions import questions

models = ["deepseek-r1:1.5b"]


def process_data_and_generate_response(conn, user_query, model_name):
    """Process query, search similar entries, and generate response"""
    try:
        cur = conn.cursor()
        query_embedding = generate_embeddings_for_input([user_query])[0]

        similar_entries_query = """
            SELECT cve_id, data, embedding <=> %s::vector AS similarity
            FROM cve_data
            ORDER BY similarity ASC
            LIMIT 30;
        """
        cur.execute(similar_entries_query, (query_embedding,))
        similar_entries = cur.fetchall()

        if not similar_entries:
            return "No relevant CVEs found.", "", model_name

        context_parts = []
        for entry in similar_entries:
            entry_data = entry[1]

            # Focus on key fields for vulnerability assessment
            entry_context = (
                f"CVE: {entry[0]}\n"
                f"Name: {entry_data.get('name', 'Unnamed Vulnerability')}\n"
                f"Description: {entry_data.get('description', 'No description available')}\n"
                f"Severity: {entry_data.get('severity', 'Unknown')} ({entry_data.get('threat', '')})\n"
                f"CVSS: {entry_data.get('cvss', 'N/A')}\n"
                f"Product: {entry_data.get('product', 'Unknown product')}\n"
                f"Affected Versions: {entry_data.get('version', 'Not specified')}\n"
                f"Mitigation: {entry_data.get('mitigation', 'No mitigation provided')}\n"
            )

            # Handle CWE list formatting
            cwe_list = entry_data.get("cwe", [])
            if cwe_list:
                entry_context += f"CWE IDs: {', '.join(cwe_list)}\n"

            entry_context += "-----"
            context_parts.append(entry_context)

        context = "\n".join(context_parts)

        prompt = f"""You are a cybersecurity expert. Answer this query: {user_query}
        Use ONLY this CVE data:
        {context}
        If no CVEs match, say "No relevant vulnerabilities found"."""

        url = "http://localhost:11434/api/generate"
        payload = {"model": model_name, "prompt": prompt, "options": {"num_ctx": 8192}}
        headers = {"Content-Type": "application/json"}
        response = requests.post(
            url, data=json.dumps(payload), headers=headers, stream=True
        )
        response.raise_for_status()

        full_response = "".join(
            json.loads(line.decode("utf-8"))["response"]
            for line in response.iter_lines()
            if line
        )

        return full_response, prompt, model_name

    except Exception as e:
        conn.rollback()
        raise Exception(f"Processing error: {str(e)}")
    finally:
        cur.close()


def main():
    try:
        conn = psycopg2.connect(
            dbname="testdb",
            user="myuser",
            password="mypassword",
            host="localhost",
            port=5432,
        )
        conn.autocommit = False

        with conn.cursor() as cur:
            cur.execute("DROP TABLE IF EXISTS cve_data;")

            cur.execute(
                """
                CREATE TABLE cve_data (
                    id SERIAL PRIMARY KEY,
                    cve_id VARCHAR(255) NOT NULL,
                    data JSONB NOT NULL,
                    embedding VECTOR(768) NOT NULL
                );
            """
            )

            cur.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_cve_data_hnsw
                ON cve_data USING hnsw (embedding vector_cosine_ops);
            """
            )

            cur.execute("SELECT setval('cve_data_id_seq', 1, false);")

            with open(
                "/home/ubuntu/ml-llm/embedding/data_compressed/job-1.json", "r"
            ) as f:
                data = json.load(f)

            total_inserted = 0
            for idx, entry in enumerate(data["results"], 1):
                cves = entry.get("cve", [])
                if not cves:
                    print(f"Skipping entry {idx}: No CVE ID")
                    continue

                cve_id = cves[0]

                # Skip existing entries check removed
                text_to_embed = (
                    f"CVE: {cve_id}\n"
                    f"Name: {entry.get('name', '')}\n"
                    f"Description: {entry.get('description', '')}\n"
                    f"CVSS: {entry.get('cvss', 'N/A')}\n"
                    f"Product: {entry.get('product', '')}"
                )

                try:
                    embedding = generate_embeddings_for_input([text_to_embed])[0]
                except Exception as e:
                    print(f"Embedding failed for {cve_id}: {str(e)}")
                    continue

                # Simple insert without conflict handling
                cur.execute(
                    """
                    INSERT INTO cve_data (cve_id, data, embedding)
                    VALUES (%s, %s, %s)
                """,
                    (cve_id, json.dumps(entry), embedding),
                )
                total_inserted += 1

            conn.commit()
            print(f"Inserted {total_inserted} CVEs")

        with open("prompt_response_log.txt", "w") as log_file:
            for query in questions:
                print(f"\n{'#'*50}\nProcessing query: {query}")

                for model in models:
                    try:
                        print(f"\nTesting model: {model}")
                        start_time = time.time()
                        response, prompt, model_name = (
                            process_data_and_generate_response(conn, query, model)
                        )
                        end_time = time.time()
                        total_time = end_time - start_time

                        # Remove <think> tags using regex
                        cleaned_response = re.sub(
                            r"<think>.*?</think>", "", response, flags=re.DOTALL
                        ).strip()

                        # Format the log entry similar to reference code
                        log_entry = (
                            f"\n{'='*50}\n"
                            f"Model: {model_name}\n"
                            f"Question: {query}\n"
                            f"Prompt:\n{prompt}\n"
                            f"Response:\n{cleaned_response}\n"
                            f"Total Time: {total_time:.2f} seconds\n"
                            f"{'-'*50}"
                        )
                        log_file.write(log_entry)

                        # Print simplified output to console
                        print(f"\nModel: {model_name}")
                        print(f"Time: {total_time:.2f}s")
                        print(
                            f"Cleaned Response: {cleaned_response[:200]}..."
                            if len(cleaned_response) > 200
                            else cleaned_response
                        )

                    except Exception as e:
                        error_msg = f"Failed with {model}: {str(e)}"
                        print(error_msg)
                        log_file.write(f"\n{error_msg}\n")

    except Exception as e:
        print(f"Fatal error: {str(e)}")
    finally:
        if "conn" in locals():
            conn.close()
            print("Database connection closed")


if __name__ == "__main__":
    main()
