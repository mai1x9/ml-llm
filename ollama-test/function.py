import requests
import ollama

# API keys and endpoint URLs
WEATHER_API_KEY = "a2c1b7295a2d4bcf933143152241610"
STOCK_API_KEY = "RRSOG4L3WPFUS7A6"
NEWS_API_KEY = "pub_5639040bd5fbfe3d927d736937f35301d4b65"

def ask_ollama(prompt):
    """Send user input to the Ollama model and get the response."""
    response = ollama.chat(
        model='mistral',
        messages=[{'role': 'user', 'content': prompt}]
    )
    return response

def get_current_weather(city):
    """Fetch current weather data for the given city."""
    WEATHER_API_URL = f"http://api.weatherapi.com/v1/current.json?key={WEATHER_API_KEY}&q={city}"
    response = requests.get(WEATHER_API_URL)
    if response.status_code == 200:
        data = response.json()
        temp_c = data['current']['temp_c']
        condition = data['current']['condition']['text']
        return f"Weather in {city}: {temp_c}°C, {condition}"
    return f"Weather in {city}: N/A, API error or invalid city."

def get_stock_price(symbol, region=None):
    """Fetch stock price and convert to INR if required."""
    STOCK_API_URL = f"https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol={symbol}&interval=5min&apikey={STOCK_API_KEY}"
    response = requests.get(STOCK_API_URL)
    data = response.json()
    if "Time Series (5min)" in data:
        latest_time = next(iter(data["Time Series (5min)"]))
        latest_data = data["Time Series (5min)"][latest_time]
        price = latest_data["4. close"]
        currency = "USD"
        if region and region.lower() == 'india':
            return f"Stock price for {symbol} in INR: ₹{float(price) * 83}"
        return f"Stock price for {symbol}: ${price} {currency}"
    return f"Stock price for {symbol}: N/A, No data available."

def get_news_headlines(context):
    """Fetch the latest news headlines."""
    url = f"https://newsdata.io/api/1/latest?apikey={NEWS_API_KEY}&q={context}&language=en"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        articles = data.get('results', [])
        if articles:
            headlines = [article['title'] for article in articles]
            return "Latest News Headlines:\n" + "\n".join(headlines)
        return "No news articles found."
    return f"Failed to fetch news, Status Code: {response.status_code}"

def process_tool_call(tool_call):
    """Execute the relevant function based on the tool call."""
    function_name = tool_call['function']['name']
    args = tool_call['function']['arguments']

    if function_name == 'get_current_weather':
        city = args.get('city')
        return get_current_weather(city)

    elif function_name == 'get_stock_price':
        symbol = args.get('symbol')
        region = args.get('region', None)  # Optional
        return get_stock_price(symbol, region)

    elif function_name == 'get_news_headlines':
        context = args.get('context')
        return get_news_headlines(context)

    return "No valid function found."

def main():
    print("Welcome to the Multi-Function Chat! Type your message below:")
    
    while True:
        user_input = input("> ")

        # 1. Send the user input to Ollama
        result = ask_ollama(user_input)

        # 2. Check if any tool calls are suggested
        tool_calls = result.get('message', {}).get('tool_calls', [])
        if tool_calls:
            # 3. Process the first tool call (you can extend this to multiple calls if needed)
            tool_result = process_tool_call(tool_calls[0])

            # 4. Feed the result of the tool call back to Ollama for the final response
            final_prompt = f"{user_input}\nHere is the requested information:\n{tool_result}"
            final_response = ask_ollama(final_prompt)

            # 5. Print the final response
            print(f"\nResponse:\n{final_response.get('message', {}).get('content', 'No response generated.')}")
        else:
            # If no tool call is needed, print the AI's natural response
            print(result.get('message', {}).get('content', 'No response generated.'))

if __name__ == "__main__":
    main()
