import psycopg2
import json
import requests
from generate_embeddings import generate_embeddings_for_input
from questions import questions


def process_data_and_generate_response(conn, user_query):
    """Process query, search similar entries, and generate response"""
    try:
        cur = conn.cursor()
        query_embedding = generate_embeddings_for_input([user_query])[0]

        similar_entries_query = """
            SELECT cve_id, data, embedding <=> %s::vector AS similarity
            FROM cve_data
            ORDER BY similarity ASC
            LIMIT 10;
        """
        cur.execute(similar_entries_query, (query_embedding,))
        similar_entries = cur.fetchall()

        if not similar_entries:
            return "No relevant CVEs found.", ""

        # Full context without truncation
        context_parts = []
        for entry in similar_entries:
            try:
                entry_data = entry[1]
                context_parts.append(
                    f"CVE: {entry[0]}\n"
                    f"Description: {entry_data.get('description', 'No description')}\n"
                    f"Severity: {entry_data.get('severity', 'Unknown')}\n"
                    "---"
                )
            except json.JSONDecodeError:
                continue

        context = "\n".join(context_parts)

        prompt = f"""You are a cybersecurity expert. Answer this query: {user_query}
        Use ONLY this CVE data:
        {context}
        If no CVEs match, say "No relevant vulnerabilities found"."""

        url = "http://localhost:11434/api/generate"
        payload = {
            "model": "deepseek-r1:1.5b",
            "prompt": prompt,
        }
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

        return full_response, prompt

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
                    embedding VECTOR(1024) NOT NULL
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
                print(f"\nProcessing query: {query}")
                try:
                    response, prompt = process_data_and_generate_response(conn, query)
                    log_file.write(
                        f"\n{'='*50}\nQuery: {query}\nResponse: {response}\n"
                    )
                    print(f"Response: {response}")
                except Exception as e:
                    print(f"Failed processing query '{query}': {str(e)}")

    except Exception as e:
        print(f"Fatal error: {str(e)}")
    finally:
        if "conn" in locals():
            conn.close()
            print("Database connection closed")


if __name__ == "__main__":
    main()
