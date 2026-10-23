
import requests

# ----------------------------------
# TravelMate - AI Travel Chatbot
# ----------------------------------

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.2:3b"

SYSTEM_PROMPT = """
You are TravelMate, an intelligent and friendly AI travel assistant.

Your responsibilities:
1. Suggest destinations based on user interests.
2. Create day-wise travel itineraries.
3. Help users plan trips according to their budget.
4. Recommend attractions, activities, and local food.
5. Suggest suitable areas for accommodation.
6. Provide packing lists and practical travel tips.
7. Ask follow-up questions when important trip details are missing.
8. Remember the conversation and use previous answers for follow-up questions.

Guidelines:
- Use clear headings and bullet points.
- Provide practical, easy-to-follow suggestions.
- Consider the user's budget, duration, and interests.
- Do not pretend to have live information about prices,
  weather, bookings, opening hours, or transport availability.
- Tell users to verify current details before travelling.
- If the destination, budget, or trip duration is unclear,
  ask a useful follow-up question.
"""

messages = [
    {
        "role": "system",
        "content": SYSTEM_PROMPT
    }
]


def display_welcome():
    print("\n" + "=" * 50)
    print("             WELCOME TO TRAVELMATE")
    print("          Your AI Travel Assistant")
    print("=" * 50)
    print("Ask me to plan trips, suggest destinations,")
    print("recommend attractions, or create itineraries.")
    print("\nCommands: 'exit' or 'quit' to close.")
    print("-" * 50)


def get_ai_response(question):
    """Send the conversation to the local Ollama model."""

    messages.append({
        "role": "user",
        "content": question
    })

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "messages": messages,
                "stream": False
            },
            timeout=180
        )

        response.raise_for_status()

        data = response.json()
        answer = data["message"]["content"]

        messages.append({
            "role": "assistant",
            "content": answer
        })

        return answer

    except requests.exceptions.ConnectionError:
        messages.pop()
        return (
            "I cannot connect to Ollama. Please make sure "
            "Ollama is installed and running on your computer."
        )

    except requests.exceptions.Timeout:
        messages.pop()
        return (
            "The AI model took too long to respond. "
            "Please try your question again."
        )

    except requests.exceptions.HTTPError as error:
        messages.pop()
        return f"Ollama returned an HTTP error: {error}"

    except (KeyError, ValueError):
        messages.pop()
        return "I could not understand the model response. Please try again."

    except requests.exceptions.RequestException as error:
        messages.pop()
        return f"An error occurred while contacting Ollama: {error}"


def main():
    display_welcome()

    while True:
        try:
            question = input("\nYou: ").strip()

            if question.lower() in ("exit", "quit", "bye"):
                print("\nTravelMate: Happy travels! Goodbye!")
                break

            if not question:
                print("TravelMate: Please enter a question.")
                continue

            print("\nTravelMate is thinking...\n")

            answer = get_ai_response(question)

            print("-" * 50)
            print("TravelMate:")
            print(answer)
            print("-" * 50)

        except KeyboardInterrupt:
            print("\n\nTravelMate: Goodbye! Happy travels!")
            break


if __name__ == "__main__":
    main()
