import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)

# Allow your local Travel Nexus website to connect.
CORS(app)

OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL_NAME = "llama3.2:3b"

SYSTEM_PROMPT = """
You are the Travel Nexus AI Assistant.

Your responsibilities:
1. Suggest destinations based on user interests.
2. Create day-wise travel itineraries.
3. Help users plan trips according to their budget.
4. Recommend attractions, activities, and local food.
5. Suggest suitable areas for accommodation.
6. Provide packing lists and practical travel tips.
7. Ask follow-up questions when important trip details are missing.
8. Remember the conversation and use previous messages for follow-up questions.

Guidelines:
- Use clear headings and bullet points.
- Provide practical, easy-to-follow suggestions.
- Consider the user's budget, duration, and interests.
- Do not pretend to have live information about prices,
  weather, bookings, opening hours, or transport availability.
- Tell users to verify current details before travelling.
- If important trip details are missing, ask a useful follow-up question.
"""


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "Travel Nexus AI backend is running"
    })


@app.route("/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])

    if not isinstance(messages, list) or not messages:
        return jsonify({
            "error": "Please enter a question."
        }), 400

    conversation = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT
        }
    ]

    # Accept recent conversation messages from the website.
    for message in messages[-20:]:
        if not isinstance(message, dict):
            continue

        role = message.get("role")
        content = message.get("content")

        if role not in ("user", "assistant"):
            continue

        if not isinstance(content, str) or not content.strip():
            continue

        conversation.append({
            "role": role,
            "content": content[:4000]
        })

    if (
        len(conversation) == 1
        or conversation[-1]["role"] != "user"
    ):
        return jsonify({
            "error": "Please enter a question."
        }), 400

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "messages": conversation,
                "stream": False
            },
            timeout=180
        )

        response.raise_for_status()

        result = response.json()
        answer = result.get("message", {}).get("content", "")

        if not answer.strip():
            return jsonify({
                "error": "The AI returned an empty response."
            }), 502

        return jsonify({
            "reply": answer.strip()
        })

    except requests.exceptions.ConnectionError:
        return jsonify({
            "error": (
                "Cannot connect to Ollama. "
                "Please check that Ollama is running."
            )
        }), 502

    except requests.exceptions.Timeout:
        return jsonify({
            "error": "The AI response timed out. Please try again."
        }), 504

    except requests.exceptions.HTTPError as error:
        print("Ollama HTTP error:", error)

        return jsonify({
            "error": (
                "Ollama could not generate a response. "
                "Check the installed model and Ollama status."
            )
        }), 502

    except (ValueError, requests.exceptions.RequestException) as error:
        print("AI connection error:", error)

        return jsonify({
            "error": "Unable to contact the local AI service."
        }), 502


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )