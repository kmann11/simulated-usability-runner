interface MessageListProps {
  title: string;
  variant: "error" | "warn" | "info";
  messages: string[];
}

export function MessageList({ title, variant, messages }: MessageListProps) {
  if (messages.length === 0) return null;
  return (
    <div className={`message-block ${variant}`}>
      <h4>{title}</h4>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
