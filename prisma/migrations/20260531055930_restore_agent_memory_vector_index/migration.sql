CREATE INDEX IF NOT EXISTS "agent_memories_embedding_idx"
ON "agent_memories" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
