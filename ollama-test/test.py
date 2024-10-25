import requests
import time
import json 
from questions import questions 

model_name = "mistral" 


filename = f"responses_{model_name.replace(':', '_')}.txt"

def test_model():
    response_count = 0  
    for question in questions:
        response_count += 1
        print(f"Processing Question {response_count}: {question}") 
        
        start_time = time.time()  
        
        try:
            response = requests.post(
                'http://localhost:11434/api/generate',
                json={
                    "model": model_name,
                    "prompt": question
                },
                stream=True  
            )

            # Collect the full answer
            full_answer = []  # List to accumulate the answer parts

            # Read response line by line
            for line in response.iter_lines():
                if line:
                    try:
                        json_response = line.decode('utf-8')  
                        data = json.loads(json_response) 
                        if data.get('done', False):
                            # If the response indicates it's done, break the loop
                            break
                        answer_part = data.get('response', '')
                        full_answer.append(answer_part)  # Append each part to the list
                    except json.JSONDecodeError as e:  
                        print(f"Error decoding JSON: {str(e)}")
                        print("Raw line:", json_response)

            complete_answer = ''.join(full_answer).strip()  # Join answer parts

            duration = time.time() - start_time  # Duration in seconds (after processing)

            
            with open(filename, 'a') as f:  
                f.write(f"Question {response_count}: {question}\n\n")
                f.write(f"Answer: {complete_answer}\n")
                f.write("\n" + "+" * 80 + "\n")
                f.write("\nSummary:\n")
                f.write(f"Model Name: {model_name}\n")  
                f.write(f"Answer Size (bytes): {len(complete_answer.encode('utf-8'))}\n")
                f.write(f"Answer Word Count: {len(complete_answer.split())}\n")
                f.write(f"Question Size (bytes): {len(question.encode('utf-8'))}\n")
                f.write(f"Question Word Count: {len(question.split())}\n")
                f.write(f"Duration (seconds): {duration:.1f}\n")  
                f.write("\n" + "-" * 80 + "\n\n") 

        except requests.exceptions.RequestException as e:
            print(f"Error while processing question: {question}")
            print(f"Exception: {str(e)}")


if __name__ == "__main__":
    test_model()
