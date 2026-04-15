import { Router, Request, Response } from "express";

const router = Router();

router.get("/hello", (_req: Request, res: Response) => {
  res.json({ message: "Hello, world!" });
});

router.get("/hello/:name", (req: Request, res: Response) => {
  const name = req.params.name;
  if (!name || name.length > 100) {
    res.status(400).json({ error: "Invalid name" });
    return;
  }
  res.json({ message: `Hello, ${name}!` });
});

export default router;
