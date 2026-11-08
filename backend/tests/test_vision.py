
import asyncio
import sys

from agents.vision_agent import analyze_product, final_request


async def main():
    if len(sys.argv) < 2:
        print("Usage: python test_vision.py image1.jpg")
        return

    analysis, coverage = await analyze_product(
        sys.argv[1:]
    )

    print("\n=== PRODUCT ANALYSIS ===")
    print(analysis.model_dump_json(indent=2))

    print("\n=== PHOTO COVERAGE DECISION ===")
    print(coverage.model_dump_json(indent=2))

    print("\n=== AGENT'S NEXT REQUEST ===")
    print(final_request(analysis, coverage))

if __name__ == "__main__":
    asyncio.run(main())
    