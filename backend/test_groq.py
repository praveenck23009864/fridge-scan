
import os
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

load_dotenv(Path(__file__).resolve().with_name(".env"))

key = os.getenv("GROQ_API_KEY")
model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

if not key:
    raise RuntimeError("GROQ_API_KEY missing in .env")

client = Groq(api_key=key)

response = client.chat.completions.create(
    model=model,
    messages=[
        {
            "role": "user",
            "content": (
                "Suggest one Indian vegetarian recipe "
                "using tomato, potato and onion."
            ),
        }
    ],
    max_tokens=300,
)

print(response.choices[0].message.content)
