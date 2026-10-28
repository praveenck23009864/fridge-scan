
import os
import base64
from pathlib import Path

from dotenv import load_dotenv
from groq import Groq

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

api_key = os.getenv("GROQ_API_KEY")
model = os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")

image_path = (
    BASE_DIR.parent
    / "frontend"
    / "public"
    / "sample-photos"
    / "fridge-1.jpg"
)

if not api_key:
    raise RuntimeError("GROQ_API_KEY missing in .env")

if not image_path.is_file():
    raise FileNotFoundError(image_path)

encoded_image = base64.b64encode(
    image_path.read_bytes()
).decode("utf-8")

client = Groq(api_key=api_key)

response = client.chat.completions.create(
    model=model,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": (
                        "Identify the visible food items "
                        "in this fridge photo. "
                        "Do not guess items you cannot see. "
                        "Return a JSON object with an "
                        "'items' array containing food names."
                    ),
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": (
                            "data:image/jpeg;base64,"
                            + encoded_image
                        )
                    },
                },
            ],
        }
    ],
    response_format={"type": "json_object"},
    max_completion_tokens=800,
)

print(response.choices[0].message.content)
