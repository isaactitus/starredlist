import React, { useState } from 'react';
import { auth } from './firebase';

export default function App() {
  const [inputPrompt, setInputPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmedPrompt = inputPrompt.trim();
    if (!trimmedPrompt) return;

    const currentUser = auth.currentUser;

    // 1. Client-Side Pre-check: Prompt user to sign in if unauthenticated
    if (!currentUser) {
      setMessages((prev) => [
        ...prev,
        { sender: 'user', text: trimmedPrompt },
        { sender: 'LIBI AI', text: '🔒 Please sign in to use LIBI AI.' }
      ]);
      setInputPrompt('');
      return;
    }

    setMessages((prev) => [...prev, { sender: 'user', text: trimmedPrompt }]);
    setInputPrompt('');
    setLoading(true);

    try {
      const token = await currentUser.getIdToken();

      const response = await fetch('https://starredlist-backend.onrender.com/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: trimmedPrompt }),
      });

      // 2. Specific 401 Unauthorized response check
      if (response.status === 401) {
        setMessages((prev) => [
          ...prev,
          { sender: 'LIBI AI', text: '🔒 Sign in required to use this feature.' }
        ]);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status code ${response.status}`);
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { sender: 'LIBI AI', text: data.reply }
      ]);
    } catch (err) {
      console.error('Chat API Error:', err);
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
