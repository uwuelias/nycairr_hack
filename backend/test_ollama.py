
from pathlib import Path
from ollama import chat



image = Path("test_images/headphones_front.jpg")

response = chat(
    model="gemma3:4b",
    messages=[
        {
            "role": "user",
            "content": (
                "Identify the product in this image. "
                "Describe its visible condition. "
                "Do not guess details you cannot verify."
            ),
            "images": [str(image.resolve())]
        }
    ]
)

print(response.message.content)
if __name__ == "__main__":
    asyncio.run(main())