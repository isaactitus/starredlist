import React, { useState } from 'react';
import { getAuth } from 'firebase/auth'; // Ensure Firebase auth is initialized in your project

export default function ChatComponent() {
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmedPrompt = inputPrompt.trim();
    if (!trimmedPrompt) return;

    const auth = getAuth();
    const currentUser = auth.currentUser;

    // 1. Client-side check: Prompt user if not signed in
    if (!currentUser) {
      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: trimmedPrompt },
        { sender: 'LIBI AI', text: '🔒 Please sign in to use LIBI AI.' }
      ]);
      setInputPrompt('');
      return;
    }

    // Display user message immediately
    setMessages((prev) => [...prev, { sender: 'user', text: trimmedPrompt }]);
    setInputPrompt('');
    setLoading(true);

    try {
      // Fetch Firebase ID Token
      const token = await currentUser.getIdToken();

      const response = await fetch('https://starredlist-backend.onrender.com/chat', { // Update with your backend URL
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      // 2. Server response check: Handle 401 Unauthorized status
      if (response.status === 401) {
        setMessages((prev) => [
          ...prev,
          { sender: 'LIBI AI', text: '🔒 Sign in required to use this feature.' }
        ]);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error('Server returned an error');
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { sender: 'LIBI AI', text: data.reply }
      ]);
    } catch (err) {
      console.error('Chat Error:', err);
      setMessages((prev) => [
        ...prev,
        { sender: 'LIBI AI', text: "⚠️ Couldn't reach LIBI AI — please check your internet connection and try again." }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <div className="messages-window">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender === 'LIBI AI' ? 'ai-msg' : 'user-msg'}`}>
            <strong>{msg.sender}:</strong> {msg.text}
          </div>
        ))}
        {loading && <div className="message ai-msg">LIBI AI is thinking...</div>}
      </div>

      <form onSubmit={handleSendMessage}>
        <input
          type="text"
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          placeholder="Ask LIBI anything..."
        />
        <button type="submit" disabled={loading}>Send</button>
      </form>
    </div>
  );
}
