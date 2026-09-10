import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();
const ALLOWED_TYPES = new Set([
  "GENRE_FAMILY",
  "GENRE",
  "SUBGENRE",
  "REGIONAL_STYLE",
  "CULTURAL_STYLE",
  "MOOD",
  "ACTIVITY",
  "THEME",
  "LANGUAGE",
  "VOCAL_STYLE",
  "INSTRUMENT",
  "ERA",
  "TEMPO_CLASS",
]);
const ALLOWED_STATUSES = ["ACTIVE"];

function escapeIlike(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function positiveInteger(value, fallback, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Math.min(Math.max(Number.isFinite(parsed) ? parsed : fallback, 1), max);
}

router.get("/", async (req, res) => {
  const page = positiveInteger(req.query.page, 1, 50);
  const limit = positiveInteger(req.query.limit, 1000, 1000);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const type = String(req.query.type || "").trim().toUpperCase();
  const parentId = String(req.query.parentId || "").trim();
  const queryText = String(req.query.q || "").trim().slice(0, 80);

  if (type && !ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ success: false, error: "Invalid taxonomy type." });
  }

  try {
    let query = supabase
      .from("music_taxonomy_terms")
      .select("id,slug,name,taxonomy_type,parent_id,description,region,status,sort_order")
      .in("status", ALLOWED_STATUSES)
      .order("taxonomy_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .range(from, to);

    if (type) query = query.eq("taxonomy_type", type);
    if (parentId === "root") query = query.is("parent_id", null);
    if (parentId && parentId !== "root") query = query.eq("parent_id", parentId);
    if (queryText) query = query.ilike("name", `%${escapeIlike(queryText)}%`);

    const { data, error } = await query;
    if (error) {
      const status = error.code === "42P01" || String(error.message || "").includes("music_taxonomy") ? 503 : 500;
      return res.status(status).json({ success: false, error: status === 503 ? "Music taxonomy is not available." : "Failed to load music taxonomy." });
    }

    return res.json({ success: true, terms: data || [], page, limit });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to load music taxonomy." });
  }
});

export default router;
