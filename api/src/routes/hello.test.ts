import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import helloRouter from "./hello";

const app = express();
app.use(helloRouter);

describe("GET /hello", () => {
  it("should return Hello, world!", async () => {
    const res = await request(app).get("/hello");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello, world!" });
  });

  it("should return JSON content type", async () => {
    const res = await request(app).get("/hello");
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});

describe("GET /hello/:name", () => {
  it("should return a personalized greeting", async () => {
    const res = await request(app).get("/hello/Alice");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Hello, Alice!" });
  });

  it("should handle names with special characters", async () => {
    const res = await request(app).get("/hello/O'Brien");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Hello, O'Brien!");
  });

  it("should handle single-character name", async () => {
    const res = await request(app).get("/hello/A");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Hello, A!");
  });

  it("should handle name at max length (100 chars)", async () => {
    const name = "a".repeat(100);
    const res = await request(app).get(`/hello/${name}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe(`Hello, ${name}!`);
  });

  it("should reject names exceeding 100 characters", async () => {
    const name = "a".repeat(101);
    const res = await request(app).get(`/hello/${name}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Invalid name" });
  });

  it("should handle URL-encoded names", async () => {
    const res = await request(app).get("/hello/John%20Doe");
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Hello, John Doe!");
  });
});
