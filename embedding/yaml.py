import requests
import json


def get_ollama_response(prompt):
    url = "http://localhost:11434/api/generate"  # Ensure this URL is correct
    model_name = "deepseek-r1:7b"  # Updated model name
    payload = {"model": model_name, "prompt": prompt}
    headers = {"Content-Type": "application/json"}

    response = requests.post(
        url, data=json.dumps(payload), headers=headers, stream=True
    )
    response.raise_for_status()

    full_response = ""
    for line in response.iter_lines():
        if line:
            chunk = json.loads(line.decode("utf-8"))
            full_response += chunk.get("response", "")

    return full_response  # Return the combined response as text


if __name__ == "__main__":
    prompt = """For this command: reg add HKEY_LOCAL_MACHINE\\Software\\Microsoft\\OLE /v EnableDCOM /t REG_SZ /d N /F give me the title, description and compliance mapping to CIS or MITRE with the relevant ids, benefits, references and tags or keywords. Give me output in YAML format having keys title, description, compliances, benefits, references, tags keys along with command as rules key. This rule falls under category firewall, so add a key in yaml called category and assign firewall to it."""

    try:
        yaml_output = get_ollama_response(prompt)
        print(yaml_output)
    except requests.exceptions.HTTPError as err:
        print(f"HTTP error occurred: {err}")
    except Exception as err:
        print(f"An error occurred: {err}")
