import sys
import json
import sentencepiece as spm

# Path to the SentencePiece model file
sp = spm.SentencePieceProcessor(model_file='./services/tokenizer.model')

def count_tokens(text):
    return len(sp.encode(text))

def chunk_text(text, max_tokens=7500):
    tokens = sp.encode(text)
    chunks = []
    for i in range(0, len(tokens), max_tokens):
        chunk_tokens = tokens[i:i + max_tokens]
        chunk_text = sp.decode(chunk_tokens)
        chunks.append(chunk_text)
    return chunks

if __name__ == "__main__":
    input_text = sys.stdin.read().strip()
    command = sys.argv[1] if len(sys.argv) > 1 else "count"
    
    if command == "count":
        token_count = count_tokens(input_text)
        print(token_count)
    elif command == "chunk":
        max_tokens = int(sys.argv[2]) if len(sys.argv) > 2 else 7500
        chunks = chunk_text(input_text, max_tokens)
        print(json.dumps(chunks))
    else:
        print("Invalid command", file=sys.stderr)
        sys.exit(1)