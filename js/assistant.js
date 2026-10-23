
/* =========================================
   TRAVEL NEXUS - AI ASSISTANT
   Connected to Django backend
========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const API_URL = window.TRAVEL_NEXUS_API_ORIGIN + "/api/authority/ai-chat/";

  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatMessages = document.getElementById("chatMessages");
  const sendButton = document.getElementById("sendButton");
  const characterCount = document.getElementById("characterCount");
  const clearChatBtn = document.getElementById("clearChatBtn");
  const clearChatIcon = document.getElementById("clearChatIcon");
  const suggestionButtons = document.querySelectorAll(".suggestion-chip");

  if (
    !chatForm ||
    !chatInput ||
    !chatMessages ||
    !sendButton ||
    !characterCount
  ) {
    console.error(
      "Travel Nexus Assistant: Required HTML elements were not found."
    );
    return;
  }

  let isWaiting = false;
  let messageCount = 0;

  const welcomeMessage =
    "Hello! Welcome to your Travel Nexus AI workspace. 👋\n\n" +
    "I can help you understand dashboard features, geofences, alerts, " +
    "traveler safety, and operational workflows. What would you like to explore?";

  // -----------------------------------------
  // CURRENT TIME
  // -----------------------------------------

  function getCurrentTime() {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(new Date());
  }

  // -----------------------------------------
  // CREATE MESSAGE
  // -----------------------------------------

  function createMessage(text, sender) {
    const row = document.createElement("div");

    row.className =
      sender === "user"
        ? "message-row user-message"
        : "message-row assistant-message";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = sender === "user" ? "A" : "✳";

    const content = document.createElement("div");
    content.className = "message-content";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const name = document.createElement("strong");
    name.textContent = sender === "user" ? "You" : "Nexus AI";

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = getCurrentTime();

    meta.append(name, time);

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    paragraph.style.whiteSpace = "pre-line";

    bubble.appendChild(paragraph);
    content.append(meta, bubble);
    row.append(avatar, content);

    chatMessages.appendChild(row);
    scrollToLatest();

    return row;
  }

  // -----------------------------------------
  // SCROLL TO LATEST MESSAGE
  // -----------------------------------------

  function scrollToLatest() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // -----------------------------------------
  // TYPING INDICATOR
  // -----------------------------------------

  function showTypingIndicator() {
    removeTypingIndicator();

    const row = document.createElement("div");
    row.className = "message-row assistant-message";
    row.id = "typingIndicator";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = "✳";

    const content = document.createElement("div");
    content.className = "message-content";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const name = document.createElement("strong");
    name.textContent = "Nexus AI";

    const status = document.createElement("span");
    status.className = "message-time";
    status.textContent = "Thinking...";

    meta.append(name, status);

    const bubble = document.createElement("div");
    bubble.className = "message-bubble typing-indicator";
    bubble.setAttribute("aria-label", "Assistant is typing");

    for (let i = 0; i < 3; i++) {
      bubble.appendChild(document.createElement("span"));
    }

    content.append(meta, bubble);
    row.append(avatar, content);
    chatMessages.appendChild(row);

    scrollToLatest();
  }

  function removeTypingIndicator() {
    document.getElementById("typingIndicator")?.remove();
  }

  // -----------------------------------------
  // BUTTON STATE
  // -----------------------------------------

  function setWaitingState(waiting) {
    isWaiting = waiting;
    sendButton.disabled = waiting;

    const buttonText = sendButton.querySelector("span:first-child");

    if (buttonText) {
      buttonText.textContent = waiting ? "Thinking..." : "Send message";
    }

    chatInput.disabled = waiting;

    suggestionButtons.forEach((button) => {
      button.disabled = waiting;
    });
  }

  // -----------------------------------------
  // SEND MESSAGE TO DJANGO BACKEND
  // -----------------------------------------

  async function sendMessage(message) {
    const cleanMessage = message.trim();

    if (!cleanMessage || isWaiting) {
      return;
    }

    if (cleanMessage.length > 4000) {
      createMessage(
        "Your message is too long. Please shorten it and try again.",
        "assistant"
      );
      return;
    }

    messageCount++;

    createMessage(cleanMessage, "user");

    chatInput.value = "";
    updateCharacterCount();
    resizeTextarea();

    setWaitingState(true);
    showTypingIndicator();

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: cleanMessage
        })
      });

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          `The server returned an unexpected response (${response.status}).`
        );
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Request failed with status ${response.status}.`
        );
      }

      if (data.success !== true || typeof data.reply !== "string") {
        throw new Error(
          data.error || "The assistant returned an invalid response."
        );
      }

      removeTypingIndicator();
      createMessage(data.reply, "assistant");
    } catch (error) {
      removeTypingIndicator();

      console.error("Travel Nexus AI request failed:", error);

      let errorMessage;

      if (error instanceof TypeError) {
        errorMessage =
          "I couldn't connect to the Travel Nexus backend.\n\n" +
          "Please check that Django is running at 127.0.0.1:8000 " +
          "and that the API URL and CORS settings are correct.";
      } else {
        errorMessage =
          "I couldn't get a response from the assistant.\n\n" +
          error.message +
          "\n\nPlease check the Django terminal and try again.";
      }

      createMessage(errorMessage, "assistant");
    } finally {
      removeTypingIndicator();
      setWaitingState(false);
      chatInput.focus();
    }
  }

  // -----------------------------------------
  // FORM SUBMISSION
  // -----------------------------------------

  chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(chatInput.value);
  });

  // Enter sends; Shift + Enter adds a new line.
  chatInput.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      chatForm.requestSubmit();
    }
  });

  // -----------------------------------------
  // CHARACTER COUNTER
  // -----------------------------------------

  function updateCharacterCount() {
    characterCount.textContent = `${chatInput.value.length} / 2000`;
  }

  chatInput.addEventListener("input", () => {
    updateCharacterCount();
    resizeTextarea();
  });

  function resizeTextarea() {
    chatInput.style.height = "auto";
    chatInput.style.height =
      Math.min(chatInput.scrollHeight, 130) + "px";
  }

  // -----------------------------------------
  // SUGGESTED PROMPTS
  // -----------------------------------------

  suggestionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = button.dataset.prompt;

      if (prompt && !isWaiting) {
        sendMessage(prompt);
      }
    });
  });

  // -----------------------------------------
  // CLEAR CONVERSATION
  // -----------------------------------------

  function clearConversation() {
    if (isWaiting) {
      return;
    }

    chatMessages.replaceChildren();
    messageCount = 0;

    const divider = document.createElement("div");
    divider.className = "date-divider";

    const dividerText = document.createElement("span");
    dividerText.textContent = "NEW CONVERSATION";

    divider.appendChild(dividerText);
    chatMessages.appendChild(divider);

    createMessage(welcomeMessage, "assistant");

    const lastRow = chatMessages.lastElementChild;
    const bubble = lastRow?.querySelector(".message-bubble");

    if (bubble) {
      const tags = document.createElement("div");
      tags.className = "message-tags";

      ["Travel operations", "Dashboard guidance", "Reports"].forEach(
        (label) => {
          const tag = document.createElement("span");
          tag.textContent = label;
          tags.appendChild(tag);
        }
      );

      bubble.appendChild(tags);
    }

    chatInput.value = "";
    updateCharacterCount();
    resizeTextarea();
    chatInput.focus();
  }

  clearChatBtn?.addEventListener("click", clearConversation);
  clearChatIcon?.addEventListener("click", clearConversation);

  // -----------------------------------------
  // INITIALIZE
  // -----------------------------------------

  updateCharacterCount();
  resizeTextarea();

  console.log("Travel Nexus AI Assistant connected to Django.");

});
