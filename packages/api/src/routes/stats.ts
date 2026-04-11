import { Router } from "express";
import { getPool } from "../services/vector.js";

const router = Router();

// Public stats — no auth, no payment
router.get("/", async (_req, res) => {
  try {
    const pool = getPool();

    // Get all embedding tables to count memories and unique agents
    const tablesResult = await pool.query(
      `SELECT table_name FROM embedding_dimensions ORDER BY dimension`
    );
    const tables = tablesResult.rows.map((r: { table_name: string }) => r.table_name);

    let totalMemories = 0;
    let memories24h = 0;
    let memories7d = 0;
    const agentIds = new Set<number>();
    const agentIds7d = new Set<number>();

    for (const table of tables) {
      const counts = await pool.query(`
        SELECT
          COUNT(*)                                                              AS total,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')    AS last_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')      AS last_7d
        FROM ${table}
      `);
      totalMemories += parseInt(counts.rows[0].total);
      memories24h   += parseInt(counts.rows[0].last_24h);
      memories7d    += parseInt(counts.rows[0].last_7d);

      // Unique agents
      const agents = await pool.query(`SELECT DISTINCT agent_id FROM ${table}`);
      agents.rows.forEach((r: { agent_id: number }) => agentIds.add(r.agent_id));

      const agents7d = await pool.query(
        `SELECT DISTINCT agent_id FROM ${table} WHERE created_at > NOW() - INTERVAL '7 days'`
      );
      agents7d.rows.forEach((r: { agent_id: number }) => agentIds7d.add(r.agent_id));
    }

    // Ops log (stores, retrieves, searches)
    let opsResult;
    try {
      opsResult = await pool.query(`
        SELECT
          COUNT(*)                                                                        AS total_24h,
          COUNT(*) FILTER (WHERE op_type = 'search')                                     AS searches_24h,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days' AND op_type = 'search') AS searches_7d
        FROM ops_log
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
    } catch {
      // ops_log table doesn't exist yet
      opsResult = { rows: [{ total_24h: 0, searches_24h: 0, searches_7d: 0 }] };
    }

    const ops = opsResult.rows[0];

    res.json({
      agents: {
        total: agentIds.size,
        active_7d: agentIds7d.size,
      },
      memories: {
        total: totalMemories,
        new_24h: memories24h,
        new_7d: memories7d,
      },
      operations: {
        total_24h: parseInt(ops.total_24h),
        searches_24h: parseInt(ops.searches_24h),
        searches_7d: parseInt(ops.searches_7d),
      },
    });
  } catch (err) {
    res.status(503).json({ error: "stats unavailable" });
  }
});

export default router;
