import asyncio
import sys

from agents.vision_agent import analyze_product, add_model_label, confirm_model



async def main():
    *product_images, label = sys.argv[1:]

    analysis, _ = await analyze_product(product_images)
    print("Before:", analysis.question)

    updated = await add_model_label(analysis, len(product_images), label)
    print("After label:", updated.model_dump_json(indent=2))

    confirmed = confirm_model(updated, True)
    print("After confirm:", confirmed.next_action)

if __name__ == "__main__":
    asyncio.run(main())