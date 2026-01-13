import { useEffect, useState, useRef } from "react";

interface StreamingTextProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
  speed?: number; // Characters per interval
  interval?: number; // Milliseconds between updates
}

/**
 * Component that displays text with a typewriter/streaming effect
 * Animates text character-by-character as it updates
 */
export function StreamingText({
  text,
  isStreaming = false,
  className = "",
  speed = 3, // characters per update
  interval = 50, // milliseconds between updates
}: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState(text);
  const targetTextRef = useRef(text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Handle streaming animation
  useEffect(() => {
    // Update target text ref immediately when text prop changes
    targetTextRef.current = text;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // If not streaming, show immediately
    if (!isStreaming) {
      setDisplayedText(text);
      return;
    }

    // Start animation to catch up to target text
    intervalRef.current = setInterval(() => {
      setDisplayedText((prev) => {
        const current = prev.length;
        const target = targetTextRef.current.length;

        // If we've caught up, stop animating
        if (current >= target) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return targetTextRef.current;
        }

        // Show more characters
        const nextLength = Math.min(current + speed, target);
        return targetTextRef.current.slice(0, nextLength);
      });
    }, interval);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [text, isStreaming, speed, interval]);

  // Show cursor when streaming and text is not complete
  const showCursor = isStreaming && displayedText.length < text.length;

  return (
    <span className={className}>
      {displayedText}
      {showCursor && <span className="animate-pulse">▊</span>}
    </span>
  );
}