import psycopg2

# Establish a connection to the database
connection = psycopg2.connect(
    dbname="testdb", user="myuser", password="mypassword", host="localhost", port=5432
)

# Create a cursor object
cursor = connection.cursor()

# Query to fetch data from cve_data table
query = "SELECT * FROM cve_data"

# Execute the query
cursor.execute(query)

# Fetch all the rows
rows = cursor.fetchall()

# Convert the rows into a string format for writing to file
data_string = ""
for row in rows:
    data_string += str(row) + "\n"

# Write the data to a text file
with open("cve_data.txt", "w") as file:
    file.write(data_string)

# Close the cursor and connection
cursor.close()
connection.close()
