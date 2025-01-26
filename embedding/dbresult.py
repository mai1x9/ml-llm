import psycopg2
import json

# Connect to the PostgreSQL database
conn = psycopg2.connect("dbname=testdb user=myuser password=mypassword")
cur = conn.cursor()

# Fetch data from the table
cur.execute("SELECT * FROM cve_data")
rows = cur.fetchall()

# Open a text file to write the data
with open("cve_data_output.txt", "w") as f:
    for row in rows:
        f.write(f"ID: {row[0]}\n")
        f.write(f"CVE ID: {row[1]}\n")
        f.write(f"Data: {json.dumps(row[2], indent=2)}\n")
        f.write(f"Embedding: {row[3]}\n\n")

# Close the connection
cur.close()
conn.close()

print("Data has been written to cve_data_output.txt")
