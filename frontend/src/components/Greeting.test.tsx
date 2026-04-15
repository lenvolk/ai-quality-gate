import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Greeting } from "./Greeting";

describe("Greeting component", () => {
  it("renders default greeting text", () => {
    render(<Greeting />);
    expect(screen.getByTestId("greeting-text")).toHaveTextContent("Hello World");
  });

  it("renders input and button", () => {
    render(<Greeting />);
    expect(screen.getByPlaceholderText("Enter your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Greet" })).toBeInTheDocument();
  });

  it("updates greeting when a name is entered and button clicked", () => {
    render(<Greeting />);
    const input = screen.getByLabelText("Name input");
    const button = screen.getByRole("button", { name: "Greet" });

    fireEvent.change(input, { target: { value: "Alice" } });
    fireEvent.click(button);

    expect(screen.getByTestId("greeting-text")).toHaveTextContent("Hello World, Alice!");
  });

  it("resets greeting when name is empty", () => {
    render(<Greeting defaultName="Bob" />);
    const input = screen.getByLabelText("Name input");
    const button = screen.getByRole("button", { name: "Greet" });

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(button);

    expect(screen.getByTestId("greeting-text")).toHaveTextContent("Hello World");
  });

  it("trims whitespace from names", () => {
    render(<Greeting />);
    const input = screen.getByLabelText("Name input");
    const button = screen.getByRole("button", { name: "Greet" });

    fireEvent.change(input, { target: { value: "  Alice  " } });
    fireEvent.click(button);

    expect(screen.getByTestId("greeting-text")).toHaveTextContent("Hello World, Alice!");
  });

  it("uses defaultName prop", () => {
    render(<Greeting defaultName="Charlie" />);
    const input = screen.getByLabelText("Name input") as HTMLInputElement;
    expect(input.value).toBe("Charlie");
  });

  it("enforces maxLength on input", () => {
    render(<Greeting maxLength={5} />);
    const input = screen.getByLabelText("Name input");

    fireEvent.change(input, { target: { value: "123456" } });
    // Value should not update because it exceeds maxLength
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("allows input at exactly maxLength", () => {
    render(<Greeting maxLength={5} />);
    const input = screen.getByLabelText("Name input");

    fireEvent.change(input, { target: { value: "12345" } });
    expect((input as HTMLInputElement).value).toBe("12345");
  });
});
