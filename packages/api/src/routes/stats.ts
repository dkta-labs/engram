import { Router } from "express";

const router = Router();

// Public stats — no auth, no payment
router.get("/", async (_req, res) => {
  try {
    res.json({
      status: "ok",
    });
  } catch (err) {
    res.status(503).json({ error: "stats unavailable" });
  }
});

export default router;
