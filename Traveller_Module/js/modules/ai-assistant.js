/* =====================================================
   TRAVEL NEXUS AI ASSISTANT
   Connects the existing chat UI to the Ollama backend.
===================================================== */

(function () {
    const API_URL = `${window.TRAVEL_NEXUS_API_ORIGIN || "http://127.0.0.1:8000"}/api/traveler/ai-chat/`;

    // Prevent duplicate event registration.
    let initialized = false;

    function initializeAIChat() {
        if (initialized) {
            return;
        }

        initialized = true;

        console.log("Travel Nexus AI Assistant initialized.");
    }

    // Open the chat using the existing modal.
    window.openChat = function () {
        const travelerName =
            typeof traveler !== "undefined" && traveler.name
                ? traveler.name
                : "Traveler";

        if (typeof openActionModal !== "function") {
            console.error("openActionModal() is unavailable.");
            alert("Unable to open the AI Assistant chat.");
            return;
        }

        openActionModal(
            "🤖 Travel Nexus AI Assistant",
            `
            <div class="chat-container">

                <div id="chatMessages" class="chat-messages">
                    <div class="chat-message bot">
                        Hello ${travelerName}! 👋
                        I am your Travel Nexus AI Assistant.
                        How can I help you?
                    </div>
                </div>

                <div class="chat-input-row">
                    <input
                        id="chatInput"
                        type="text"
                        placeholder="Ask about travel safety..."
                        autocomplete="off"
                    >

                    <button
                        id="sendChatButton"
                        type="button"
                    >
                        Send
                    </button>
                </div>

            </div>
            `
        );

        setTimeout(function () {
            const input = document.getElementById("chatInput");
            const sendButton =
                document.getElementById("sendChatButton");

            if (!input || !sendButton) {
                console.error("AI chat elements were not created.");
                return;
            }

            input.addEventListener("keydown", function (event) {
                if (event.key === "Enter") {
                    event.preventDefault();
                    window.sendChatMessage();
                }
            });

            sendButton.addEventListener("click", function () {
                window.sendChatMessage();
            });

            input.focus();
        }, 100);
    };

    // Send a message to the shared Django API used by the rest of the app.
    window.sendChatMessage = async function () {
        const input = document.getElementById("chatInput");
        const messagesElement =
            document.getElementById("chatMessages");
        const sendButton =
            document.getElementById("sendChatButton");

        if (!input || !messagesElement) {
            console.error("AI chat elements are unavailable.");
            return;
        }

        const question = input.value.trim();

        if (!question || input.disabled) {
            return;
        }

        // Display the user's message.
        const userBubble = document.createElement("div");
        userBubble.className = "chat-message user";
        userBubble.textContent = question;

        messagesElement.appendChild(userBubble);

        // Display a temporary response.
        const botBubble = document.createElement("div");
        botBubble.className = "chat-message bot";
        botBubble.textContent = "Thinking...";

        messagesElement.appendChild(botBubble);

        input.value = "";
        input.disabled = true;

        if (sendButton) {
            sendButton.disabled = true;
        }

        messagesElement.scrollTop = messagesElement.scrollHeight;

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ message: question })
            });

            let data;
            try {
                data = await response.json();
            } catch {
                throw new Error(`The server returned an unexpected response (${response.status}).`);
            }

            if (!response.ok) {
                throw new Error(
                    data.error || "The AI service returned an error."
                );
            }

            if (data.success !== true || typeof data.reply !== "string" || !data.reply.trim()) {
                throw new Error("The AI returned an empty response.");
            }

            const answer = data.reply.trim();
            botBubble.textContent = answer;

        } catch (error) {
            console.error("Travel Nexus AI error:", error);

            botBubble.textContent =
                "Sorry, I couldn't get a response. " +
                (error.message || "Please check the Travel Nexus API and try again.");

        } finally {
            input.disabled = false;

            if (sendButton) {
                sendButton.disabled = false;
            }

            input.focus();
            messagesElement.scrollTop = messagesElement.scrollHeight;
        }
    };

    // The module loader dispatches this event after loading app.js.
    document.addEventListener(
        "travelnexus:ready",
        initializeAIChat
    );
})();
