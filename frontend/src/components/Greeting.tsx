import React, { useState } from "react";

export interface GreetingProps {
  defaultName?: string;
  maxLength?: number;
}

export function Greeting({ defaultName = "", maxLength = 100 }: GreetingProps) {
  const [name, setName] = useState(defaultName);
  const [greeting, setGreeting] = useState("Hello World");

  const handleGreet = () => {
    const trimmed = name.trim();
    if (trimmed) {
      setGreeting(`Hello World, ${trimmed}!`);
    } else {
      setGreeting("Hello World");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      setName(value);
    }
  };

  return (
    <div className="greeting-container">
      <h1 data-testid="greeting-text">{greeting}</h1>
      <div>
        <input
          type="text"
          value={name}
          onChange={handleChange}
          placeholder="Enter your name"
          aria-label="Name input"
          maxLength={maxLength}
        />
        <button onClick={handleGreet}>Greet</button>
      </div>
    </div>
  );
}
