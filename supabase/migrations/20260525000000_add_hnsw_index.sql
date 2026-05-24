-- Optimize database memory and timeouts for large index creation
SET statement_timeout = 0;
SET maintenance_work_mem = '128MB';

-- Add HNSW vector index for extremely fast approximate nearest neighbor search
CREATE INDEX IF NOT EXISTS ai_knowledge_base_embedding_hnsw_idx 
ON ai_knowledge_base 
USING hnsw (embedding vector_cosine_ops);
